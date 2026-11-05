// Convenções de tipo do banco (AGENTS.md §Banco). Usadas pelas operações do pacote e
// pelos tickets de port (Cardápio, Pedido, taxas) quando surgirem colunas de dinheiro.

/** Agora em ISO-8601 UTC com milissegundos: o mesmo formato do default das colunas. */
export function utcNow(): string {
  return new Date().toISOString();
}

declare const centsBrand: unique symbol;
/** Valor monetário em centavos inteiros (nunca float). */
export type Cents = number & { readonly [centsBrand]: "Cents" };

/** Valida e marca um valor em centavos: inteiro seguro e não negativo. */
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`valor em centavos inválido: ${value}`);
  }
  return value as Cents;
}

export function newId(): string {
  return crypto.randomUUID();
}
