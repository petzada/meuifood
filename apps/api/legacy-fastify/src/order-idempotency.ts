import { createHash } from "node:crypto";

/**
 * Contrato idempotente canônico (Stripe-like) para criação de Pedido:
 * - mesma chave + mesmo fingerprint → mesmo Pedido
 * - mesma chave + fingerprint divergente → conflito seguro
 */
export function fingerprintIdempotentPayload(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export type IdempotencyResolution<T> =
  | { kind: "fresh" }
  | { kind: "replay"; value: T }
  | { kind: "conflict" };

export function resolveIdempotentReplay<T>(
  existingHash: string | null | undefined,
  requestHash: string,
  existingValue: T | null | undefined,
): IdempotencyResolution<T> {
  if (!existingHash || !existingValue) return { kind: "fresh" };
  if (existingHash === requestHash) {
    return { kind: "replay", value: existingValue };
  }
  return { kind: "conflict" };
}
