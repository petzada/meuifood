/**
 * Status de cobrança da API Cobranças da Efí.
 * Docs: https://dev.efipay.com.br/docs/api-cobrancas/status
 *
 * Fluxo do cartão: `new` → `waiting` → `approved` (emissor aprovou, ainda não
 * creditado) → `paid`. `unpaid` = recusado. Finais: `paid`, `contested`, `refunded`,
 * `settled`, `canceled`.
 */
export type EfiChargeStatus =
  | "new"
  | "waiting"
  | "identified"
  | "link"
  | "approved"
  | "paid"
  | "settled"
  | "unpaid"
  | "refunded"
  | "canceled"
  | "expired"
  | "contested";

export type EfiChargeOutcome =
  "pending" | "approved" | "paid" | "declined" | "refunded" | "canceled" | "contested" | "unknown";

const OUTCOMES: Record<EfiChargeStatus, EfiChargeOutcome> = {
  new: "pending",
  waiting: "pending",
  identified: "pending",
  link: "pending",
  approved: "approved",
  paid: "paid",
  settled: "paid",
  unpaid: "declined",
  refunded: "refunded",
  canceled: "canceled",
  expired: "canceled",
  contested: "contested",
};

export function classifyEfiChargeStatus(status: string): EfiChargeOutcome {
  return (OUTCOMES as Record<string, EfiChargeOutcome | undefined>)[status] ?? "unknown";
}

/** Status em que `PUT /v1/charge/:id/cancel` é aceito. */
export function isEfiCancelable(status: string): boolean {
  return status === "new" || status === "waiting" || status === "unpaid" || status === "link";
}

/** Estorno de cartão (`/v1/charge/card/:id/refund`) só com `paid`. */
export function isEfiRefundable(status: string): boolean {
  return status === "paid";
}

/**
 * Política de "Pedido pago" no cartão Normal (Ticket 27, decidida e registrada no ticket).
 *
 * A doc de status da API Cobranças diz que `approved` = "aprovado pela operadora do cartão mas
 * ainda não foi creditado" e `paid` = "pagamento confirmado"; o one-step aprovado já responde
 * `approved`, e a passagem para `paid` acompanha o crédito na conta Efí (que no Normal leva até a
 * liberação). Esperar `paid` deixaria o Pedido fora da cozinha por horas/dias. Escolha: o Pedido
 * é pago em `approved` (ou `paid`/`settled`), mas SÓ por fonte canônica — a resposta autenticada
 * do one-step ou `GET /v1/notification/:token` / `GET /v1/charge/:id` com credenciais, nunca o
 * navegador. É o mesmo ponto do Rápido (AbacatePay `APPROVED` libera o Pedido). Reversão depois
 * de aprovado (`unpaid`/`canceled`/`refunded`/`contested`) não regride o Pedido: fica registrada
 * para o Estorno/Contestação (Ticket 12).
 */
export const EFI_CARD_PAID_POLICY: EfiPaidPolicy = "approved";

export type EfiPaidPolicy = "approved" | "paid";

export function isEfiPaidForOrder(status: string, policy: EfiPaidPolicy): boolean {
  const outcome = classifyEfiChargeStatus(status);
  if (outcome === "paid") return true;
  return policy === "approved" && outcome === "approved";
}
