// `@foode/shared/order` (Ticket 24a, contrato): estados e transições do Pedido, horários e
// "Loja aberta agora", configuração operacional da Loja, checkout (cotação e criação idempotente),
// contratos públicos do Storefront (estado da Loja, página do Pedido, busca por telefone) e
// contrato do Painel (fila, detalhe, transições). Consumido pela `api`, pelo Storefront (24a) e
// pelo Painel (24b).
export * from "./status.js";
export * from "./hours.js";
export * from "./settings.js";
export * from "./checkout.js";
export * from "./storefront.js";
export * from "./painel.js";
export * from "./cancellation.js";
