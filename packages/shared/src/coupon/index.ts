// Subpath `@foode/shared/coupon` (Ticket 13): regras puras do Cupom (código, validade por data e
// dia da semana em America/Sao_Paulo, desconto com teto, fora da taxa de Delivery, boas-vindas de
// primeira compra por Loja) e o contrato do Painel (`/cupons`). Consumido pela api, admin e web.
export * from "./rules.js";
export * from "./admin.js";
