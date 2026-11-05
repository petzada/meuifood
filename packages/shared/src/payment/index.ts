// `@foode/shared/payment` (Ticket 26): contrato público do PIX na página do Pedido, tarifa de
// serviço do pagamento online (decisão 71), regras de dinheiro do Ledger e o calendário de dias
// úteis do repasse D+1 (decisão 60). Consumido pela `api`, pelo Storefront e pelo Ticket 27.
export * from "./pix.js";
export * from "./ledger.js";
export * from "../business-days.js";
