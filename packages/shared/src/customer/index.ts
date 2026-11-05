// Subpath `@foode/shared/customer` (Ticket 13; decisões 65, 66, 68): conta do Consumidor por código
// de 4 dígitos no WhatsApp. Conta ÚNICA na Foode (nome, telefone, CPF), dados por Loja. Dono,
// Operador e Ops continuam com e-mail e senha (Ticket 22): nada aqui vale para o Painel.
//
// Rotas públicas da api (o Storefront repassa pelo binding, com `cookie` e `cf-connecting-ip`):
// - POST /storefront/conta/codigo            `customerCodeRequestSchema`  → 200 `customerCodeSentSchema`
// - POST /storefront/conta/codigo/verificar  `customerCodeVerifySchema`   → 200 `customerCodeVerifiedSchema` + cookie
// - POST /storefront/conta                   `customerSignupSchema`       → 201 `customerSessionStateSchema` + cookie
// - POST /storefront/conta/sair                                            → 204 + cookie apagado
// - GET  /storefront/conta                                                 → 200 `customerSessionStateSchema`
// - GET  /storefront/lojas/:slug/conta/pedidos                             → 200 `customerOrdersSchema`
// Erros: `{ error: CustomerErrorCode, ... }` com o status de `customerErrorHttpStatus`.
export * from "./account.js";
export * from "./login.js";
