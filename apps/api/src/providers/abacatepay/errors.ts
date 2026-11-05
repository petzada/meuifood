/**
 * Erro tipado das chamadas à AbacatePay. Carrega só metadados (status, código curto,
 * endpoint sem query): nunca corpo, token `ctok_`, CPF nem chave.
 *
 * - `retriable`: pode repetir a mesma chamada (5xx, 429, `LOCK_NOT_ACQUIRED`).
 * - `uncertain`: a AbacatePay pode ter processado (timeout, rede, 2xx ilegível). Antes
 *   de repetir uma criação, consultar pela cobrança já persistida na intenção.
 */
export type AbacatePayErrorKind =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "card_declined"
  | "insufficient_funds"
  | "under_dispute"
  | "lock_not_acquired"
  | "already_refunded"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "network"
  | "invalid_response"
  | "unknown";

export type AbacatePayErrorInit = {
  kind: AbacatePayErrorKind;
  status: number;
  /** Texto curto de `error` do envelope ou código local; nunca o corpo inteiro. */
  code: string;
  endpoint: string;
  retriable?: boolean;
  uncertain?: boolean;
};

export class AbacatePayError extends Error {
  readonly provider = "abacatepay" as const;
  readonly kind: AbacatePayErrorKind;
  readonly status: number;
  readonly code: string;
  readonly endpoint: string;
  readonly retriable: boolean;
  readonly uncertain: boolean;

  constructor(init: AbacatePayErrorInit) {
    super(`AbacatePay ${init.endpoint} falhou: ${init.kind} (${init.status} ${init.code})`);
    this.name = "AbacatePayError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.endpoint = init.endpoint;
    this.retriable = init.retriable ?? false;
    this.uncertain = init.uncertain ?? false;
  }
}

export function isAbacatePayError(error: unknown): error is AbacatePayError {
  return error instanceof AbacatePayError;
}

const MAX_CODE_LENGTH = 200;

/** Normaliza o texto de erro do provedor para um código curto e sem quebras. */
export function shortCode(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_CODE_LENGTH);
}

/**
 * Classifica o erro pelo texto devolvido em `error` e pelo status HTTP.
 *
 * TODO(26/27): a pesquisa cita os códigos `INSUFFICIENT_FUNDS`,
 * `TRANSACTION_UNDER_DISPUTE` e `LOCK_NOT_ACQUIRED` e a mensagem "Esta cobrança já
 * foi reembolsada.", mas não confirma se `error` vem como código ou como frase.
 * Casamos os dois formatos; conferir no Dev mode e ajustar as fixtures.
 */
export function classifyAbacatePayError(
  status: number,
  code: string,
  context: { cardCreate?: boolean } = {},
): { kind: AbacatePayErrorKind; retriable: boolean } {
  const normalized = code
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  if (normalized.includes("INSUFFICIENT_FUNDS") || normalized.includes("SALDO INSUFICIENTE")) {
    return { kind: "insufficient_funds", retriable: false };
  }
  if (normalized.includes("UNDER_DISPUTE") || normalized.includes("DISPUTA")) {
    return { kind: "under_dispute", retriable: false };
  }
  if (normalized.includes("LOCK_NOT_ACQUIRED")) {
    return { kind: "lock_not_acquired", retriable: true };
  }
  if (normalized.includes("JA FOI REEMBOLSADA") || normalized.includes("ALREADY_REFUNDED")) {
    return { kind: "already_refunded", retriable: false };
  }
  if (status === 401) return { kind: "unauthorized", retriable: false };
  if (status === 403) return { kind: "forbidden", retriable: false };
  if (status === 404 || normalized.includes("NOT_FOUND")) return { kind: "not_found", retriable: false };
  if (status === 429) return { kind: "rate_limited", retriable: true };
  if (status >= 500) return { kind: "provider_unavailable", retriable: true };
  // Recusa de cartão volta como 400 genérico ("Não foi possível processar…").
  if (status === 400 && context.cardCreate) return { kind: "card_declined", retriable: false };
  if (status >= 400) return { kind: "invalid_request", retriable: false };
  return { kind: "unknown", retriable: false };
}
