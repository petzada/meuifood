import { z } from "zod";
import { parseEfiNotificationEvents, isEfiNotificationToken, type EfiNotificationEvent } from "./notification.js";

/**
 * Cliente da API Cobranças da Efí (cartão de crédito "Normal"), sem SDK: o oficial
 * depende de `fs`/`https.Agent`. A API Cobranças NÃO exige mTLS (só Pix/Open Finance),
 * então roda em Workers com `fetch` puro.
 * Docs: https://dev.efipay.com.br/docs/api-cobrancas/cartao e .../credenciais
 *
 * - OAuth: `POST /v1/authorize` com HTTP Basic (client_id:client_secret) →
 *   `access_token` de 600 s. Cacheado por instância (crie uma por isolate) com margem
 *   de 60 s; um 401 invalida o cache e repete a chamada uma vez.
 * - Envelope `{ code, data }`; valores em centavos.
 * - O `payment_token` vem do navegador (`payment-token-efi`); nunca é logado.
 * - Idempotência é nossa: `customId` (≤ 255) = chave da intenção persistida antes da
 *   chamada. Timeout/rede viram `EfiError.uncertain`: consultar antes de repetir.
 */

export const EFI_CHARGES_BASE_URLS = {
  production: "https://cobrancas.api.efipay.com.br",
  sandbox: "https://cobrancas-h.api.efipay.com.br",
} as const;

export type EfiEnvironment = keyof typeof EFI_CHARGES_BASE_URLS;
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 15_000;
const TOKEN_SAFETY_MARGIN_MS = 60_000;
const MAX_CODE_LENGTH = 200;

export type EfiErrorKind =
  | "not_configured"
  | "unauthorized"
  | "validation"
  | "not_found"
  | "invalid_state"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "network"
  | "invalid_response"
  | "unknown";

export class EfiError extends Error {
  readonly provider = "efi" as const;
  readonly kind: EfiErrorKind;
  readonly status: number;
  /** `error` do corpo (ex.: `validation_error`) ou código local. Nunca o corpo. */
  readonly code: string;
  /** Campo recusado (`error_description.property`), quando houver. */
  readonly property: string | null;
  readonly endpoint: string;
  readonly retriable: boolean;
  readonly uncertain: boolean;

  constructor(init: {
    kind: EfiErrorKind;
    status: number;
    code: string;
    endpoint: string;
    property?: string | null;
    retriable?: boolean;
    uncertain?: boolean;
  }) {
    super(`Efí ${init.endpoint} falhou: ${init.kind} (${init.status} ${init.code})`);
    this.name = "EfiError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.property = init.property ?? null;
    this.endpoint = init.endpoint;
    this.retriable = init.retriable ?? false;
    this.uncertain = init.uncertain ?? false;
  }
}

export function isEfiError(error: unknown): error is EfiError {
  return error instanceof EfiError;
}

export type EfiChargesClientOptions = {
  clientId: string;
  clientSecret: string;
  environment: EfiEnvironment;
  fetch?: FetchLike;
  /** Relógio injetável (cache do token). */
  now?: () => number;
  timeoutMs?: number;
};

export type EfiCardCustomer = {
  name: string;
  /** Com ou sem máscara; enviado só com dígitos. */
  cpf: string;
  email: string;
  /** Com DDD, com ou sem máscara. */
  phoneNumber: string;
  /**
   * `YYYY-MM-DD`. TODO(27): [não confirmado] se é exigido em produção; o exemplo da
   * doc não usa. Testar na homologação.
   */
  birth?: string;
};

export type EfiBillingAddress = {
  street: string;
  number: string;
  neighborhood: string;
  zipcode: string;
  city: string;
  /** UF, ex.: `SP`. */
  state: string;
  complement?: string;
};

export type CreateEfiCardChargeInput = {
  /** Chave de idempotência nossa; vai em `metadata.custom_id`. */
  customId: string;
  amountCents: number;
  /** Nome do item na fatura (ex.: "Pedido #123"). */
  itemName: string;
  paymentToken: string;
  customer: EfiCardCustomer;
  /** TODO(27): [não confirmado] se é exigido em produção. */
  billingAddress?: EfiBillingAddress;
  /** URL pública com `?secret=` (decisão 60). Nunca logar. */
  notificationUrl?: string;
};

export type EfiCardCharge = {
  chargeId: number;
  status: string;
  totalCents: number;
  customId: string | null;
  /** Motivo da recusa em `unpaid`; nunca contém dados do cartão. */
  refusalReason: string | null;
  /** A Efí sugere nova tentativa (com outro cartão/token) em `unpaid`. */
  refusalRetry: boolean | null;
};

const envelopeSchema = z.looseObject({ code: z.number().optional(), data: z.unknown().optional() });

const authorizeSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const oneStepSchema = z.looseObject({
  charge_id: z.number().int(),
  status: z.string().min(1),
  total: z.number().int(),
  custom_id: z.string().nullish(),
  refusal: z.looseObject({ reason: z.string().nullish(), retry: z.boolean().nullish() }).nullish(),
});

const chargeDetailSchema = z.looseObject({
  charge_id: z.number().int(),
  status: z.string().min(1),
  total: z.number().int(),
  custom_id: z.string().nullish(),
});

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${label} deve ser inteiro positivo em centavos`);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** Nome do campo recusado, só se tiver cara de caminho (nunca a mensagem com dados). */
function invalidProperty(body: Record<string, unknown> | undefined): string | null {
  const description = body?.error_description;
  if (description && typeof description === "object") {
    const property = (description as { property?: unknown }).property;
    if (typeof property === "string" && /^[\w/.[\]-]{1,120}$/.test(property)) return property;
  }
  return null;
}

function classify(status: number, code: string): { kind: EfiErrorKind; retriable: boolean } {
  // A API Cobranças devolve `validation_error` até com 500: recusa de conteúdo, sem retry.
  if (code === "validation_error") return { kind: "validation", retriable: false };
  if (status === 401) return { kind: "unauthorized", retriable: false };
  if (status === 404) return { kind: "not_found", retriable: false };
  if (status === 409 || status === 422) return { kind: "invalid_state", retriable: false };
  if (status === 429) return { kind: "rate_limited", retriable: true };
  if (status >= 500) return { kind: "provider_unavailable", retriable: true };
  if (status >= 400) return { kind: "validation", retriable: false };
  return { kind: "unknown", retriable: false };
}

type Method = "GET" | "POST" | "PUT";

export type EfiChargesClient = ReturnType<typeof createEfiChargesClient>;

export function createEfiChargesClient(options: EfiChargesClientOptions) {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = EFI_CHARGES_BASE_URLS[options.environment];
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function send(
    method: Method,
    path: string,
    endpoint: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<{ status: number; ok: boolean; json: Record<string, unknown> | undefined }> {
    let response: Response;
    let text: string;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: { Accept: "application/json", ...headers, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const timeout = isTimeout(error);
      throw new EfiError({
        kind: timeout ? "timeout" : "network",
        status: 0,
        code: timeout ? "TIMEOUT" : "NETWORK_ERROR",
        endpoint,
        retriable: true,
        uncertain: true,
      });
    }
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    const json = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
    return { status: response.status, ok: response.ok, json };
  }

  function fail(status: number, json: Record<string, unknown> | undefined, endpoint: string): never {
    const raw = typeof json?.error === "string" && json.error.trim() ? json.error.trim() : `HTTP_${status}`;
    const code = raw.slice(0, MAX_CODE_LENGTH);
    const { kind, retriable } = classify(status, code);
    throw new EfiError({ kind, status, code, endpoint, property: invalidProperty(json), retriable });
  }

  async function accessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS > now()) return cachedToken.value;
    const endpoint = "POST /v1/authorize";
    if (!options.clientId || !options.clientSecret) {
      throw new EfiError({ kind: "not_configured", status: 0, code: "NOT_CONFIGURED", endpoint });
    }
    const basic = btoa(`${options.clientId}:${options.clientSecret}`);
    const { status, ok, json } = await send(
      "POST",
      "/v1/authorize",
      endpoint,
      { Authorization: `Basic ${basic}` },
      { grant_type: "client_credentials" },
    );
    if (!ok) fail(status, json, endpoint);
    // Algumas respostas de auth vêm sem envelope; aceita os dois formatos.
    const candidate = json && "data" in json ? json.data : json;
    const parsed = authorizeSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new EfiError({ kind: "invalid_response", status, code: "INVALID_RESPONSE", endpoint });
    }
    cachedToken = { value: parsed.data.access_token, expiresAt: now() + parsed.data.expires_in * 1000 };
    return cachedToken.value;
  }

  async function request<S extends z.ZodType>(
    method: Method,
    path: string,
    /** Caminho sem ids (ex.: `/v1/charge/:id`): vai no erro; o real pode ter token. */
    template: string,
    body: unknown,
    schema: S,
  ): Promise<z.output<S>> {
    const endpoint = `${method} ${template}`;
    let attempt = 0;
    for (;;) {
      const token = await accessToken();
      const { status, ok, json } = await send(method, path, endpoint, { Authorization: `Bearer ${token}` }, body);
      if (status === 401 && attempt === 0) {
        cachedToken = null;
        attempt += 1;
        continue;
      }
      if (!ok) fail(status, json, endpoint);
      const envelope = envelopeSchema.safeParse(json);
      const parsed = envelope.success ? schema.safeParse(envelope.data.data) : null;
      if (!parsed?.success) {
        throw new EfiError({ kind: "invalid_response", status, code: "INVALID_RESPONSE", endpoint, uncertain: true });
      }
      return parsed.data;
    }
  }

  /**
   * `POST /v1/charge/one-step`: cria e paga numa chamada, à vista (`installments: 1`).
   * Recusa NÃO é exceção: volta `status: "unpaid"` com `refusalReason`.
   */
  async function createCardCharge(input: CreateEfiCardChargeInput): Promise<EfiCardCharge> {
    assertCents(input.amountCents, "amountCents");
    if (!input.customId || input.customId.length > 255) throw new TypeError("customId deve ter de 1 a 255 caracteres");
    if (!input.paymentToken) throw new TypeError("paymentToken obrigatório");
    const { customer, billingAddress } = input;
    const raw = await request(
      "POST",
      "/v1/charge/one-step",
      "/v1/charge/one-step",
      {
        items: [{ name: input.itemName.slice(0, 255), value: input.amountCents, amount: 1 }],
        metadata: {
          custom_id: input.customId,
          ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
        },
        payment: {
          credit_card: {
            installments: 1,
            payment_token: input.paymentToken,
            customer: {
              name: customer.name,
              cpf: digits(customer.cpf),
              email: customer.email,
              phone_number: digits(customer.phoneNumber),
              ...(customer.birth ? { birth: customer.birth } : {}),
            },
            ...(billingAddress
              ? {
                  billing_address: {
                    street: billingAddress.street,
                    number: billingAddress.number,
                    neighborhood: billingAddress.neighborhood,
                    zipcode: digits(billingAddress.zipcode),
                    city: billingAddress.city,
                    state: billingAddress.state,
                    ...(billingAddress.complement ? { complement: billingAddress.complement } : {}),
                  },
                }
              : {}),
            // TODO(27): [não confirmado] como enviar `tds_identifier` (3DS) na cobrança.
          },
        },
      },
      oneStepSchema,
    );
    return {
      chargeId: raw.charge_id,
      status: raw.status,
      totalCents: raw.total,
      customId: raw.custom_id ?? input.customId,
      refusalReason: raw.refusal?.reason ?? null,
      refusalRetry: raw.refusal?.retry ?? null,
    };
  }

  /** `GET /v1/charge/:id`. */
  async function getCharge(chargeId: number): Promise<EfiCardCharge> {
    const raw = await request("GET", `/v1/charge/${chargeId}`, "/v1/charge/:id", undefined, chargeDetailSchema);
    return {
      chargeId: raw.charge_id,
      status: raw.status,
      totalCents: raw.total,
      customId: raw.custom_id ?? null,
      refusalReason: null,
      refusalRetry: null,
    };
  }

  /**
   * `POST /v1/charge/card/:id/refund`. Sem `amountCents` = total (até 360 dias);
   * parcial até 90 dias, um por dia. Só `paid`. O desfecho chega pela notificação.
   */
  async function refundCardCharge(chargeId: number, amountCents?: number): Promise<void> {
    if (amountCents !== undefined) assertCents(amountCents, "amountCents");
    await request(
      "POST",
      `/v1/charge/card/${chargeId}/refund`,
      "/v1/charge/card/:id/refund",
      amountCents !== undefined ? { amount: amountCents } : {},
      z.unknown(),
    );
  }

  /** `PUT /v1/charge/:id/cancel` (só `new|waiting|unpaid|link`; ver `isEfiCancelable`). */
  async function cancelCharge(chargeId: number): Promise<void> {
    await request("PUT", `/v1/charge/${chargeId}/cancel`, "/v1/charge/:id/cancel", undefined, z.unknown());
  }

  /**
   * `GET /v1/notification/:token`: histórico cronológico da cobrança. A consulta
   * autenticada é o que prova a origem e o que a Efí conta como "entregue".
   */
  async function getNotification(token: string): Promise<EfiNotificationEvent[]> {
    if (!isEfiNotificationToken(token)) throw new TypeError("token de notificação inválido");
    const raw = await request("GET", `/v1/notification/${encodeURIComponent(token)}`, "/v1/notification/:token", undefined, z.unknown());
    return parseEfiNotificationEvents(raw);
  }

  return { createCardCharge, getCharge, refundCardCharge, cancelCharge, getNotification };
}
