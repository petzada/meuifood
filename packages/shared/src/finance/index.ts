// Subpath `@foode/shared/finance` (Ticket 14): contrato do financeiro do Dono (Plano/faixa está em
// `@foode/shared/onboarding`; relatórios, comparativo, CSV e Repasses aqui) e dos lotes diários e
// margem do Ops. Só o Dono (`store.finance`) e o Ops (`ops.area`) chegam a estas RPCs.
export * from "./comparison.js";
export * from "./csv.js";
export * from "./payout.js";
export * from "./period.js";
export * from "./report.js";
