import { z } from "@foode/shared/zod";

/**
 * Notificações da API Cobranças da Efí. A Efí faz `POST` na `notification_url` só
 * com o token (`notification=<token>`), sem assinatura; o estado vem de
 * `GET /v1/notification/:token` (ver `client.getNotification`).
 * Docs: https://dev.efipay.com.br/docs/api-cobrancas/notificacoes
 *
 * A autenticação da entrada é o `?secret=` da URL (decisão 60), comparado em tempo
 * constante. Nunca logar a URL (segredo), o corpo nem o token.
 *
 * O mesmo token vale para todo o ciclo da cobrança e o histórico é cumulativo:
 * processar TODOS os itens com `id` maior que o último visto, não só o último.
 */

export const EFI_SECRET_QUERY_PARAM = "secret";
const MAX_BODY_LENGTH = 4_096;
const TOKEN_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i += 1) diff |= (da[i] ?? 0) ^ (db[i] ?? 0);
  return diff === 0;
}

/** Confere `?secret=` contra o nosso segredo. Sem segredo configurado, recusa tudo. */
export async function verifyEfiNotificationSecret(
  querySecret: string | null | undefined,
  expectedSecret: string,
): Promise<boolean> {
  if (!expectedSecret || !querySecret) return false;
  return timingSafeEqualString(querySecret, expectedSecret);
}

export function isEfiNotificationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * Extrai o token do corpo do POST. TODO(27): content-type [não confirmado] — o
 * exemplo PHP sugere `application/x-www-form-urlencoded`; aceita também JSON,
 * decidindo pelo conteúdo quando o header falta ou diverge. `null` = sem token válido.
 */
export function parseEfiNotificationToken(
  rawBody: string,
  contentType: string | null,
): string | null {
  if (rawBody.length === 0 || rawBody.length > MAX_BODY_LENGTH) return null;
  const trimmed = rawBody.trim();
  let token: unknown = null;
  const looksJson = (contentType ?? "").toLowerCase().includes("json") || trimmed.startsWith("{");
  if (looksJson) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      token =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).notification
          : null;
    } catch {
      token = null;
    }
  } else {
    token = new URLSearchParams(trimmed).get("notification");
  }
  return isEfiNotificationToken(token) ? token : null;
}

export type EfiNotificationEvent = {
  /** Sequencial crescente da Efí dentro do token. */
  id: number;
  type: string;
  chargeId: number | null;
  customId: string | null;
  currentStatus: string;
  previousStatus: string | null;
  /** Centavos, nos eventos de pagamento. */
  valueCents: number | null;
  createdAt: string | null;
  receivedByBankAt: string | null;
};

const eventSchema = z.looseObject({
  id: z.number().int(),
  type: z.string().min(1),
  custom_id: z.string().nullish(),
  created_at: z.string().nullish(),
  value: z.number().int().nullish(),
  received_by_bank_at: z.string().nullish(),
  status: z.looseObject({ current: z.string().min(1), previous: z.string().nullish() }),
  identifiers: z.looseObject({ charge_id: z.number().int().nullish() }).nullish(),
});

export class EfiNotificationPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EfiNotificationPayloadError";
  }
}

/** Converte o `data` de `GET /v1/notification/:token` em eventos, em ordem de `id`. */
export function parseEfiNotificationEvents(data: unknown): EfiNotificationEvent[] {
  const parsed = z.array(eventSchema).safeParse(data);
  if (!parsed.success)
    throw new EfiNotificationPayloadError("notificação Efí em formato inesperado");
  return parsed.data
    .map((event) => ({
      id: event.id,
      type: event.type,
      chargeId: event.identifiers?.charge_id ?? null,
      customId: event.custom_id ?? null,
      currentStatus: event.status.current,
      previousStatus: event.status.previous ?? null,
      valueCents: event.value ?? null,
      createdAt: event.created_at ?? null,
      receivedByBankAt: event.received_by_bank_at ?? null,
    }))
    .sort((a, b) => a.id - b.id);
}

/** Eventos ainda não processados (`id` > último visto), em ordem. */
export function unseenEfiEvents(
  events: EfiNotificationEvent[],
  lastSeenId: number | null,
): EfiNotificationEvent[] {
  return lastSeenId === null ? events : events.filter((event) => event.id > lastSeenId);
}

/** Chave de deduplicação do evento no inbox: `efi:<charge_id>:<id>`. */
export function efiEventKey(event: EfiNotificationEvent): string {
  return `efi:${event.chargeId ?? "sem-charge"}:${event.id}`;
}
