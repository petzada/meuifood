// Marca do contrato do Ticket 22: assinaturas existem, o fluxo entra na fatia API.
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`não implementado (Ticket 22): ${what}`);
    this.name = "NotImplementedError";
  }
}
