import { z } from "zod";

/**
 * Webhooks da AbacatePay: verificação e parser tipado. Só Web Crypto (Workers).
 * Docs: https://docs.abacatepay.com/pages/webhooks/security e
 * https://docs.abacatepay.com/pages/webhooks/events/transparent
 *
 * Duas camadas, ambas obrigatórias e comparadas em tempo constante:
 * 1. `?webhookSecret=` da URL contra o nosso segredo — é o que prova a origem;
 * 2. `X-Webhook-Signature` = base64(HMAC-SHA256(corpo CRU, chave pública da
 *    AbacatePay)) — integridade. Calcular sobre `await req.text()` ANTES do parse.
 *
 * Nunca logar a URL completa (carrega o segredo) nem o corpo (dados do pagador).
 */

export const ABACATEPAY_SIGNATURE_HEADER = "X-Webhook-Signature";
export const ABACATEPAY_SECRET_QUERY_PARAM = "webhookSecret";

export type VerifyAbacatePayWebhookInput = {
  /** Corpo exatamente como recebido. */
  rawBody: string;
  /** Valor de `?webhookSecret=`. */
  querySecret: string | null | undefined;
  /** Valor do header `X-Webhook-Signature`. */
  signatureHeader: string | null | undefined;
  /** Nosso segredo, cadastrado na URL do webhook (`wrangler secret`). */
  webhookSecret: string;
  /**
   * Chave pública fixa publicada na página de segurança da AbacatePay.
   * TODO(26): copiar o valor vigente da doc para uma variável de ambiente; não
   * versionar aqui para não ficar desatualizado em silêncio.
   */
  signingKey: string;
};

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Compara digests de tamanho fixo: não vaza tamanho nem posição da diferença. */
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i += 1) diff |= (da[i] ?? 0) ^ (db[i] ?? 0);
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** base64(HMAC-SHA256(rawBody, key)). Exportado para gerar fixtures/testes. */
export async function signAbacatePayBody(rawBody: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(rawBody));
  return toBase64(new Uint8Array(signature));
}

/** `true` só se segredo da URL E assinatura conferirem. Sem configuração, recusa. */
export async function verifyAbacatePayWebhook(input: VerifyAbacatePayWebhookInput): Promise<boolean> {
  if (!input.webhookSecret || !input.signingKey) return false;
  if (!input.querySecret || !input.signatureHeader) return false;
  const expected = await signAbacatePayBody(input.rawBody, input.signingKey);
  // Avalia as duas antes de decidir, para o tempo não revelar qual falhou.
  const [secretOk, signatureOk] = await Promise.all([
    timingSafeEqualString(input.querySecret, input.webhookSecret),
    timingSafeEqualString(input.signatureHeader.trim(), expected),
  ]);
  return secretOk && signatureOk;
}

export type AbacatePayTransparentEventType =
  | "transparent.completed"
  | "transparent.refunded"
  | "transparent.disputed"
  | "transparent.lost";

const TRANSPARENT_EVENTS: ReadonlySet<string> = new Set<AbacatePayTransparentEventType>([
  "transparent.completed",
  "transparent.refunded",
  "transparent.disputed",
  "transparent.lost",
]);

export type AbacatePayChargeMethod = "PIX" | "CARD" | "UNKNOWN";

export type AbacatePayWebhookCharge = {
  id: string;
  method: AbacatePayChargeMethod;
  status: string;
  amountCents: number;
  platformFeeCents: number | null;
  /** Nossa chave de idempotência, se a cobrança foi criada por este cliente. */
  intentId: string | null;
  metadata: Record<string, string>;
};

export type AbacatePayWebhookEvent =
  | {
      kind: "transparent";
      /** `log_…`: igual em todas as retentativas → chave de deduplicação. */
      eventId: string;
      type: AbacatePayTransparentEventType;
      devMode: boolean;
      apiVersion: number | null;
      charge: AbacatePayWebhookCharge;
    }
  | {
      /** Evento fora do escopo (ex.: `transfer.*`): responder 2xx e ignorar. */
      kind: "ignored";
      eventId: string | null;
      type: string;
      devMode: boolean;
    };

export class AbacatePayWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbacatePayWebhookPayloadError";
  }
}

// A doc pede para não validar o payload inteiro (campos novos aparecem): só o
// necessário é obrigatório. `taxId` do pagador vem mascarado e não é lido.
const envelopeSchema = z.looseObject({
  id: z.string().min(1).nullish(),
  event: z.string().min(1),
  apiVersion: z.number().nullish(),
  devMode: z.boolean().nullish(),
  data: z.record(z.string(), z.unknown()),
});

// TODO(26/27): campos de `data.transparent` [não confirmado] além de id/status/amount;
// `method` pode não vir — inferido pelo prefixo do id (`pix_char_` / `card_`).
const transparentSchema = z.looseObject({
  transparent: z.looseObject({
    id: z.string().min(1),
    status: z.string().min(1),
    amount: z.number().int(),
    method: z.string().nullish(),
    platformFee: z.number().nullish(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
  }),
});

function methodOf(id: string, method: string | null | undefined): AbacatePayChargeMethod {
  const upper = method?.toUpperCase();
  if (upper === "PIX" || upper === "CARD") return upper;
  if (id.startsWith("pix_char_")) return "PIX";
  if (id.startsWith("card_")) return "CARD";
  return "UNKNOWN";
}

/**
 * Lê um corpo JÁ verificado. Lança `AbacatePayWebhookPayloadError` (mensagem sem
 * conteúdo do corpo) se o JSON ou o formato mínimo forem inválidos.
 */
export function parseAbacatePayWebhook(rawBody: string): AbacatePayWebhookEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new AbacatePayWebhookPayloadError("payload AbacatePay não é JSON");
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) throw new AbacatePayWebhookPayloadError("payload AbacatePay sem event ou data");
  const { id, event, devMode, apiVersion, data } = envelope.data;

  if (!TRANSPARENT_EVENTS.has(event)) {
    return { kind: "ignored", eventId: id ?? null, type: event, devMode: devMode ?? false };
  }
  if (!id) throw new AbacatePayWebhookPayloadError(`payload AbacatePay sem id para ${event}`);
  const parsed = transparentSchema.safeParse(data);
  if (!parsed.success) throw new AbacatePayWebhookPayloadError(`payload AbacatePay inválido para ${event}`);

  const t = parsed.data.transparent;
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(t.metadata ?? {})) {
    if (typeof value === "string") metadata[key] = value;
  }
  return {
    kind: "transparent",
    eventId: id,
    type: event as AbacatePayTransparentEventType,
    devMode: devMode ?? false,
    apiVersion: apiVersion ?? null,
    charge: {
      id: t.id,
      method: methodOf(t.id, t.method),
      status: t.status,
      amountCents: t.amount,
      platformFeeCents: t.platformFee ?? null,
      intentId: metadata.intentId ?? null,
      metadata,
    },
  };
}
