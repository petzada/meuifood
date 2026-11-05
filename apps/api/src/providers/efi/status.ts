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
  | "pending"
  | "approved"
  | "paid"
  | "declined"
  | "refunded"
  | "canceled"
  | "contested"
  | "unknown";

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
 * Política de "Pedido pago" no cartão Normal.
 *
 * TODO(27): decidir se o Pedido é marcado pago em `approved` (emissor aprovou) ou
 * só em `paid` (creditado). Recomendação da pesquisa: aceitar o Pedido em
 * `approved`, lançar o Ledger como "a liberar" e só considerar confirmado em `paid`.
 * O parâmetro é obrigatório de propósito: ninguém herda uma escolha implícita.
 */
export type EfiPaidPolicy = "approved" | "paid";

export function isEfiPaidForOrder(status: string, policy: EfiPaidPolicy): boolean {
  const outcome = classifyEfiChargeStatus(status);
  if (outcome === "paid") return true;
  return policy === "approved" && outcome === "approved";
}
