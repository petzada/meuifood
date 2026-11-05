// Regras de dinheiro do pagamento online (Ticket 26; decisões 60, 61 e 71): taxa Foode sobre o
// total do Pedido, tarifa de serviço do Consumidor e o lançamento do Ledger com liberação e
// repasse previsto D+1 útil. Tudo em centavos inteiros, sem ponto flutuante.
import { expectedPayoutDate, saoPauloDate, type CivilDate } from "../business-days.js";
import { MAX_CENTS } from "../money.js";

/**
 * Tarifa de serviço do pagamento online (decisão 71): R$ 1,50 por Pedido pago por PIX ou
 * Cartão, cobrada do Consumidor depois de itens, Complementos, Delivery e Cupom (o Cupom não
 * incide sobre ela e ela não entra na base da taxa Foode). Fica 100% com a Foode: nunca entra no
 * líquido do lojista. Pagamento na entrega não tem tarifa. Não configurável no app.
 */
export const ONLINE_SERVICE_FEE_CENTS = 150;

/** Rótulo da linha própria no checkout, no acompanhamento e no Painel. */
export const SERVICE_FEE_LABEL_PT = "Tarifa de serviço (pagamento online)";

/** Meios que pagam agora (com tarifa de serviço). */
export function serviceFeeCentsFor(method: "pix" | "credit" | "on_delivery"): number {
  return method === "on_delivery" ? 0 : ONLINE_SERVICE_FEE_CENTS;
}

/** Taxa Foode: % em basis points (349 = 3,49%) + fixo em centavos. */
export type FeeRate = { percentBps: number; fixedCents: number };

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) {
    throw new RangeError(`ledger: ${label} inválido (${value})`);
  }
}

/**
 * Valor de uma taxa sobre `baseCents`: % com arredondamento meio-para-cima + fixo, limitado à
 * própria base (a taxa nunca deixa líquido negativo).
 */
export function feeCents(baseCents: number, rate: FeeRate): number {
  assertCents(baseCents, "base");
  if (!Number.isInteger(rate.percentBps) || rate.percentBps < 0 || rate.percentBps > 10_000) {
    throw new RangeError(`ledger: percentBps inválido (${rate.percentBps})`);
  }
  assertCents(rate.fixedCents, "fixedCents");
  const percent = Math.floor((baseCents * rate.percentBps + 5_000) / 10_000);
  return Math.min(baseCents, percent + rate.fixedCents);
}

export type PaymentLedgerInput = {
  /** Total do Pedido do lojista (itens + Delivery − Cupom), base da taxa Foode. */
  orderTotalCents: number;
  /** Tarifa de serviço cobrada do Consumidor (receita da Foode). */
  serviceFeeCents: number;
  /** Taxa Foode vigente gravada na intenção (snapshot). */
  foodeFee: FeeRate;
  /** Custo do provedor informado por ele (ou calculado pela tabela do Ops); null = desconhecido. */
  providerCostCents: number | null;
  /** Instante em que o provedor liberou o saldo (PIX: o próprio pagamento). */
  releasedAt: Date;
  /**
   * Data civil da liberação quando difere do instante (Cartão: prazo do provedor ou data
   * informada, Ticket 27). Ausente = dia civil de `releasedAt` em São Paulo.
   */
  releaseDate?: CivilDate;
};

export type PaymentLedgerSnapshot = {
  /** O que o Consumidor pagou: total do Pedido + tarifa de serviço. */
  chargedCents: number;
  orderTotalCents: number;
  serviceFeeCents: number;
  foodeFeeCents: number;
  providerCostCents: number | null;
  /** A repassar ao lojista: total do Pedido − taxa Foode (a tarifa de serviço nunca entra). */
  netCents: number;
  /** Data civil (São Paulo) da liberação no provedor. */
  releaseDate: CivilDate;
  /** 1º dia útil depois da liberação (decisão 60). */
  expectedPayoutDate: CivilDate;
};

/** Lançamento único do Ledger para um pagamento confirmado. */
export function paymentLedgerSnapshot(input: PaymentLedgerInput): PaymentLedgerSnapshot {
  assertCents(input.orderTotalCents, "orderTotalCents");
  assertCents(input.serviceFeeCents, "serviceFeeCents");
  if (input.providerCostCents !== null) assertCents(input.providerCostCents, "providerCostCents");
  const foodeFeeCents = feeCents(input.orderTotalCents, input.foodeFee);
  const releaseDate = input.releaseDate ?? saoPauloDate(input.releasedAt);
  return {
    chargedCents: input.orderTotalCents + input.serviceFeeCents,
    orderTotalCents: input.orderTotalCents,
    serviceFeeCents: input.serviceFeeCents,
    foodeFeeCents,
    providerCostCents: input.providerCostCents,
    netCents: input.orderTotalCents - foodeFeeCents,
    releaseDate,
    expectedPayoutDate: expectedPayoutDate(releaseDate),
  };
}
