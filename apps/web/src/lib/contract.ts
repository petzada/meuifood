// O que o `web` precisa de um schema do contrato de `@foode/shared`: só `safeParse`. Evita
// importar o zod no app (o contrato é o schema do pacote, não um tipo redigitado aqui).
export type ContractSchema<T> = {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
};
