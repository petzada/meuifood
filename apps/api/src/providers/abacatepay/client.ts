import { z } from "@foode/shared/zod";
import { AbacatePayError, classifyAbacatePayError, shortCode } from "./errors.js";

/**
 * Cliente da AbacatePay v2 (checkout transparente): PIX, cartão "Rápido" e estorno.
 * Só `fetch` + JSON, compatível com Workers. Docs: https://docs.abacatepay.com/llms.txt
 *
 * - Base única para Dev mode e produção: o ambiente é a chave de API.
 * - Envelope `{ data, error, success }`; valores sempre em centavos.
 * - A AbacatePay não documenta `Idempotency-Key`: a idempotência é nossa. Toda criação
 *   exige `intentId` (a chave da intenção persistida ANTES da chamada), que vai em
 *   `metadata.intentId` para conciliar por webhook ou consulta. Timeout/rede viram
 *   `AbacatePayError.uncertain`: o chamador consulta antes de criar de novo.
 * - Nada aqui loga: corpo, `ctok_`, CPF e chave nunca saem deste módulo.
 */

export const ABACATEPAY_BASE_URL = "https://api.abacatepay.com/v2";
const DEFAULT_TIMEOUT_MS = 15_000;
/** Mínimo documentado para PIX. */
export const ABACATEPAY_PIX_MIN_AMOUNT_CENTS = 100;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type AbacatePayClientOptions = {
  apiKey: string;
  /** Injetável nos testes; padrão `fetch` global. */
  fetch?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
};

/** Metadata da AbacatePay só aceita strings. */
export type AbacatePayMetadata = Record<string, string>;

export type AbacatePayPixStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED";
export type AbacatePayCardStatus = "APPROVED" | "PENDING" | "PAID" | "FAILED" | "REFUNDED";
/** Status desconhecido chega como string, sem quebrar o parse. */
type OpenStatus<T extends string> = T | (string & Record<never, never>);

export type CreatePixChargeInput = {
  /** Chave de idempotência nossa (intenção persistida antes da chamada). */
  intentId: string;
  amountCents: number;
  description?: string;
  /** Validade do QR em segundos. */
  expiresInSeconds?: number;
  /** Opcional no PIX; só exigido com `ensureSameTaxId`. */
  customer?: Partial<AbacatePayCardCustomer>;
  metadata?: AbacatePayMetadata;
};

export type AbacatePayPixCharge = {
  id: string;
  status: OpenStatus<AbacatePayPixStatus>;
  amountCents: number;
  /** Copia-e-cola. */
  brCode: string;
  /** PNG em data URL. */
  brCodeBase64: string;
  /** Custo do provedor em centavos, quando informado. */
  platformFeeCents: number | null;
  expiresAt: string | null;
  devMode: boolean;
  metadata: AbacatePayMetadata;
};

export type AbacatePayPixCheck = {
  status: OpenStatus<AbacatePayPixStatus>;
  expiresAt: string | null;
};

export type AbacatePayCardCustomer = {
  name: string;
  email: string;
  /** CPF (ou CNPJ), com ou sem máscara. */
  taxId: string;
  cellphone: string;
};

export type CreateCardChargeInput = {
  intentId: string;
  /** Precisa ser igual ao `amount` usado no `AbacatePay.create` do navegador. */
  amountCents: number;
  /** `ctok_` de uso único (60 s), gerado pelo abacatepay.js. Nunca logar. */
  token: string;
  /** Os quatro campos são obrigatórios no cartão. */
  customer: AbacatePayCardCustomer;
  metadata?: AbacatePayMetadata;
};

export type AbacatePayCardCharge = {
  id: string;
  /** `APPROVED` libera o Pedido; `PAID` = adquirente repassou (depois, sem ação). */
  status: OpenStatus<AbacatePayCardStatus>;
  amountCents: number;
  brand: string | null;
  lastFour: string | null;
  platformFeeCents: number | null;
  devMode: boolean;
  metadata: AbacatePayMetadata;
};

export type RefundChargeInput = {
  /** `pix_char_…`, `card_…` ou `char_…`. Estorno é sempre total. */
  id: string;
  reason?: string;
};

export type AbacatePayRefundResult = {
  id: string;
  status: string | null;
  /** O provedor respondeu "já reembolsada": tratado como sucesso idempotente. */
  alreadyRefunded: boolean;
};

const metadataSchema = z.record(z.string(), z.unknown()).nullish();

const pixChargeSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string().min(1),
  amount: z.number().int(),
  brCode: z.string().min(1),
  brCodeBase64: z.string().min(1),
  platformFee: z.number().nullish(),
  expiresAt: z.string().nullish(),
  devMode: z.boolean().nullish(),
  metadata: metadataSchema,
});

// TODO(26): a doc de `/transparents/check` não detalha o corpo além de `status` e
// `expiresAt` [não confirmado]; conferir no Dev mode.
const pixCheckSchema = z.looseObject({
  status: z.string().min(1),
  expiresAt: z.string().nullish(),
});

const cardChargeSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string().min(1),
  amount: z.number().int(),
  brand: z.string().nullish(),
  lastFour: z.string().nullish(),
  platformFee: z.number().nullish(),
  devMode: z.boolean().nullish(),
  metadata: metadataSchema,
});

// TODO(26): corpo de sucesso do estorno [não confirmado]; só `id`/`status` opcionais.
const refundSchema = z
  .looseObject({ id: z.string().nullish(), status: z.string().nullish() })
  .nullish();

function stringMetadata(raw: Record<string, unknown> | null | undefined): AbacatePayMetadata {
  const out: AbacatePayMetadata = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function assertCents(value: number, label: string, min = 1): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new TypeError(`${label} deve ser inteiro em centavos >= ${min}`);
  }
}

function assertIntentId(intentId: string): void {
  if (!intentId || intentId.length > 200)
    throw new TypeError("intentId deve ter de 1 a 200 caracteres");
}

function buildMetadata(
  intentId: string,
  metadata: AbacatePayMetadata | undefined,
): AbacatePayMetadata {
  return { ...metadata, intentId };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

type RequestOptions = { method: "GET" | "POST"; body?: unknown; cardCreate?: boolean };

export type AbacatePayClient = ReturnType<typeof createAbacatePayClient>;

export function createAbacatePayClient(options: AbacatePayClientOptions) {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl ?? ABACATEPAY_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<S extends z.ZodType>(
    path: string,
    query: Record<string, string> | null,
    init: RequestOptions,
    schema: S,
  ): Promise<z.output<S>> {
    // Endpoint sem query: a query pode ter identificadores.
    const endpoint = `${init.method} ${path}`;
    if (!options.apiKey) {
      throw new AbacatePayError({
        kind: "not_configured",
        status: 0,
        code: "NOT_CONFIGURED",
        endpoint,
      });
    }
    const url = `${baseUrl}${path}${query ? `?${new URLSearchParams(query).toString()}` : ""}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: "application/json",
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    let text: string;
    try {
      response = await doFetch(url, {
        method: init.method,
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const timeout = isTimeout(error);
      throw new AbacatePayError({
        kind: timeout ? "timeout" : "network",
        status: 0,
        code: timeout ? "TIMEOUT" : "NETWORK_ERROR",
        endpoint,
        retriable: true,
        uncertain: true,
      });
    }

    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    const envelope =
      json !== null && typeof json === "object" ? (json as Record<string, unknown>) : undefined;
    const providerError =
      typeof envelope?.error === "string" && envelope.error.trim()
        ? shortCode(envelope.error)
        : undefined;

    if (!response.ok || envelope?.success === false || providerError) {
      const code = providerError ?? `HTTP_${response.status}`;
      const { kind, retriable } = classifyAbacatePayError(response.status, code, {
        cardCreate: init.cardCreate ?? false,
      });
      throw new AbacatePayError({ kind, status: response.status, code, endpoint, retriable });
    }
    if (!envelope) {
      throw new AbacatePayError({
        kind: "invalid_response",
        status: response.status,
        code: "INVALID_RESPONSE",
        endpoint,
        uncertain: true,
      });
    }
    const parsed = schema.safeParse(envelope.data);
    if (!parsed.success) {
      // 2xx com formato inesperado: a operação provavelmente ocorreu.
      throw new AbacatePayError({
        kind: "invalid_response",
        status: response.status,
        code: "INVALID_RESPONSE",
        endpoint,
        uncertain: true,
      });
    }
    return parsed.data;
  }

  /** `POST /transparents/create` com `method: "PIX"`. */
  async function createPixCharge(input: CreatePixChargeInput): Promise<AbacatePayPixCharge> {
    assertIntentId(input.intentId);
    assertCents(input.amountCents, "amountCents", ABACATEPAY_PIX_MIN_AMOUNT_CENTS);
    if (input.expiresInSeconds !== undefined)
      assertCents(input.expiresInSeconds, "expiresInSeconds");
    const raw = await request(
      "/transparents/create",
      null,
      {
        method: "POST",
        body: {
          method: "PIX",
          data: {
            amount: input.amountCents,
            ...(input.description ? { description: input.description } : {}),
            ...(input.expiresInSeconds !== undefined ? { expiresIn: input.expiresInSeconds } : {}),
            ...(input.customer ? { customer: input.customer } : {}),
            metadata: buildMetadata(input.intentId, input.metadata),
          },
        },
      },
      pixChargeSchema,
    );
    return {
      id: raw.id,
      status: raw.status,
      amountCents: raw.amount,
      brCode: raw.brCode,
      brCodeBase64: raw.brCodeBase64,
      platformFeeCents: raw.platformFee ?? null,
      expiresAt: raw.expiresAt ?? null,
      devMode: raw.devMode ?? false,
      metadata: stringMetadata(raw.metadata),
    };
  }

  /** `GET /transparents/check?id=pix_char_…` (só PIX). */
  async function checkPixCharge(id: string): Promise<AbacatePayPixCheck> {
    if (!id) throw new TypeError("id obrigatório");
    const raw = await request("/transparents/check", { id }, { method: "GET" }, pixCheckSchema);
    return { status: raw.status, expiresAt: raw.expiresAt ?? null };
  }

  /**
   * `POST /transparents/create` com `method: "CARD"` (Rápido), à vista
   * (`installmentCount` omitido). Recusa = `AbacatePayError` `card_declined`.
   * Timeout NÃO é recusa: consultar com `getCardCharge`/webhook antes de repetir.
   */
  async function createCardCharge(input: CreateCardChargeInput): Promise<AbacatePayCardCharge> {
    assertIntentId(input.intentId);
    assertCents(input.amountCents, "amountCents");
    if (!input.token) throw new TypeError("token obrigatório");
    const { name, email, taxId, cellphone } = input.customer;
    if (!name || !email || !taxId || !cellphone) {
      throw new TypeError("customer exige name, email, taxId e cellphone");
    }
    const raw = await request(
      "/transparents/create",
      null,
      {
        method: "POST",
        cardCreate: true,
        body: {
          method: "CARD",
          data: {
            amount: input.amountCents,
            token: input.token,
            customer: { name, email, taxId, cellphone },
            metadata: buildMetadata(input.intentId, input.metadata),
          },
        },
      },
      cardChargeSchema,
    );
    return toCardCharge(raw);
  }

  /** `GET /transparents/get?id=card_…`. */
  async function getCardCharge(id: string): Promise<AbacatePayCardCharge> {
    if (!id) throw new TypeError("id obrigatório");
    const raw = await request("/transparents/get", { id }, { method: "GET" }, cardChargeSchema);
    return toCardCharge(raw);
  }

  /**
   * `POST /transparents/refund` — sempre total. "Já reembolsada" vira sucesso com
   * `alreadyRefunded: true`. `insufficient_funds` (saldo `available` da conta não
   * cobre) e `under_dispute` sobem como erro; `lock_not_acquired` é retriable.
   */
  async function refundCharge(input: RefundChargeInput): Promise<AbacatePayRefundResult> {
    if (!input.id) throw new TypeError("id obrigatório");
    try {
      const raw = await request(
        "/transparents/refund",
        null,
        {
          method: "POST",
          body: { id: input.id, ...(input.reason ? { reason: input.reason } : {}) },
        },
        refundSchema,
      );
      return { id: raw?.id ?? input.id, status: raw?.status ?? null, alreadyRefunded: false };
    } catch (error) {
      if (error instanceof AbacatePayError && error.kind === "already_refunded") {
        return { id: input.id, status: "REFUNDED", alreadyRefunded: true };
      }
      throw error;
    }
  }

  return { createPixCharge, checkPixCharge, createCardCharge, getCardCharge, refundCharge };
}

function toCardCharge(raw: z.output<typeof cardChargeSchema>): AbacatePayCardCharge {
  // `cardToken` permanente não é exposto: não há recorrência e não deve ser guardado.
  return {
    id: raw.id,
    status: raw.status,
    amountCents: raw.amount,
    brand: raw.brand ?? null,
    lastFour: raw.lastFour ?? null,
    platformFeeCents: raw.platformFee ?? null,
    devMode: raw.devMode ?? false,
    metadata: stringMetadata(raw.metadata),
  };
}
