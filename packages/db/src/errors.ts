// Erros de regra de @foode/db. A api traduz o código para o RpcResult (`not_found`,
// `conflict`, `forbidden`, `invalid_input`); falha inesperada continua exceção comum.

export type FoodeDbErrorCode =
  "forbidden" | "slug_unavailable" | "invalid_input" | "not_found" | "conflict";

export class FoodeDbError extends Error {
  constructor(
    readonly code: FoodeDbErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "FoodeDbError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : "";
  return message.includes("UNIQUE constraint failed");
}
