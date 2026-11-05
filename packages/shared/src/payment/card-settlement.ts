// Regras puras do dinheiro do Cartão à vista (Ticket 27; decisões 60, 61, 71 e 76): liberação
// prevista no provedor, retenção como parcela separada e o lançamento do Ledger. Sem banco, sem
// relógio implícito: tudo em centavos inteiros e datas civis de São Paulo.
//
// - Liberação prevista: a data informada pelo provedor, quando válida (não antes do dia da
//   aprovação); senão o prazo máximo do modo — Efí (Normal) até 21 dias úteis, AbacatePay (Rápido)
//   até 1 dia útil — contado a partir do dia civil (São Paulo) da aprovação.
// - Repasse previsto = 1º dia útil depois da liberação (decisão 60), para o lançamento e para cada
//   retenção.
// - Retenção do provedor (se ele informar): parcela separada do LÍQUIDO do lojista, com liberação
//   própria (nunca antes da liberação principal); somadas, nunca passam do líquido.
// - Ledger: taxa Foode do modo sobre o total do Pedido, tarifa de serviço (R$ 1,50, decisão 71)
//   só da Foode, custo do provedor para conferência do Ops. Só à vista (sem parcelamento).
import {
  addBusinessDays,
  expectedPayoutDate,
  saoPauloDate,
  type CivilDate,
} from "../business-days.js";
import type { CardMode } from "../ops/stores.js";
import { paymentLedgerSnapshot, type FeeRate, type PaymentLedgerSnapshot } from "./ledger.js";
import {
  ABACATEPAY_CARD_RELEASE_MAX_BUSINESS_DAYS,
  EFI_CARD_RELEASE_MAX_BUSINESS_DAYS,
} from "./card.js";

export type CardSettlementProvider = "efi" | "abacatepay";

/** Prazo máximo de liberação (dias úteis) por provedor do modo. */
export const CARD_RELEASE_MAX_BUSINESS_DAYS: Record<CardSettlementProvider, number> = {
  efi: EFI_CARD_RELEASE_MAX_BUSINESS_DAYS,
  abacatepay: ABACATEPAY_CARD_RELEASE_MAX_BUSINESS_DAYS,
};

/** Provedor do Cartão por modo (Normal = Efí, Rápido = AbacatePay). */
export function cardProviderOf(mode: CardMode): CardSettlementProvider {
  return mode === "normal" ? "efi" : "abacatepay";
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Retenção informada pelo provedor (parte do líquido liberada numa data própria). */
export type InformedRetention = { amountCents: number; releaseDate: CivilDate };

export type CardRetentionParcel = {
  amountCents: number;
  releaseDate: CivilDate;
  expectedPayoutDate: CivilDate;
};

export type CardReleasePlan = {
  /** Data civil (São Paulo) prevista da liberação no provedor. */
  releaseDate: CivilDate;
  /** `informed` = data do provedor; `max_term` = prazo máximo do modo. */
  releaseSource: "informed" | "max_term";
  /** 1º dia útil depois da liberação. */
  expectedPayoutDate: CivilDate;
};

/** Último dia da liberação pelo prazo máximo do provedor (dias úteis depois da aprovação). */
export function cardMaxReleaseDate(provider: CardSettlementProvider, approvedAt: Date): CivilDate {
  return addBusinessDays(saoPauloDate(approvedAt), CARD_RELEASE_MAX_BUSINESS_DAYS[provider]);
}

/**
 * Liberação prevista: a data informada pelo provedor quando é uma data real e não é anterior ao dia
 * da aprovação; senão o prazo máximo do modo.
 */
export function cardReleasePlan(input: {
  provider: CardSettlementProvider;
  approvedAt: Date;
  informedReleaseDate?: string | null;
}): CardReleasePlan {
  const approvedDay = saoPauloDate(input.approvedAt);
  const informed = input.informedReleaseDate ?? null;
  const useInformed = informed !== null && isCivilDate(informed) && informed >= approvedDay;
  const releaseDate = useInformed ? informed : cardMaxReleaseDate(input.provider, input.approvedAt);
  return {
    releaseDate,
    releaseSource: useInformed ? "informed" : "max_term",
    expectedPayoutDate: expectedPayoutDate(releaseDate),
  };
}

/**
 * Parcelas de retenção (uma por data de liberação, somando as informadas no mesmo dia), cada uma
 * com repasse no dia útil seguinte. Data inválida ou anterior à liberação principal passa a ser a
 * própria liberação principal (nunca antecipamos). Soma acima do líquido = erro (o provedor não
 * retém mais do que o lojista tem a receber).
 */
export function cardRetentionParcels(
  retentions: readonly InformedRetention[],
  mainReleaseDate: CivilDate,
  netCents: number,
): CardRetentionParcel[] {
  const byDate = new Map<CivilDate, number>();
  let total = 0;
  for (const retention of retentions) {
    if (!Number.isSafeInteger(retention.amountCents) || retention.amountCents <= 0) {
      throw new RangeError(`retenção inválida (${retention.amountCents})`);
    }
    const date =
      isCivilDate(retention.releaseDate) && retention.releaseDate >= mainReleaseDate
        ? retention.releaseDate
        : mainReleaseDate;
    total += retention.amountCents;
    byDate.set(date, (byDate.get(date) ?? 0) + retention.amountCents);
  }
  if (total > netCents) throw new RangeError("retenção maior que o líquido do lojista");
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([releaseDate, amountCents]) => ({
      amountCents,
      releaseDate,
      expectedPayoutDate: expectedPayoutDate(releaseDate),
    }));
}

export type CardLedgerInput = {
  provider: CardSettlementProvider;
  /** Total do Pedido do lojista (base da taxa Foode). */
  orderTotalCents: number;
  /** Tarifa de serviço cobrada do Consumidor (decisão 71). */
  serviceFeeCents: number;
  /** Taxa Foode do modo gravada na intenção. */
  foodeFee: FeeRate;
  providerCostCents: number | null;
  /** Instante da aprovação canônica. */
  approvedAt: Date;
  informedReleaseDate?: string | null;
  retentions?: readonly InformedRetention[];
};

export type CardLedger = {
  ledger: PaymentLedgerSnapshot;
  release: CardReleasePlan;
  retentions: CardRetentionParcel[];
};

/** Lançamento do Cartão: mesmas somas do PIX, liberação do provedor e retenções separadas. */
export function cardLedger(input: CardLedgerInput): CardLedger {
  const release = cardReleasePlan(input);
  const ledger = paymentLedgerSnapshot({
    orderTotalCents: input.orderTotalCents,
    serviceFeeCents: input.serviceFeeCents,
    foodeFee: input.foodeFee,
    providerCostCents: input.providerCostCents,
    releasedAt: input.approvedAt,
    releaseDate: release.releaseDate,
  });
  return {
    ledger,
    release,
    retentions: cardRetentionParcels(input.retentions ?? [], release.releaseDate, ledger.netCents),
  };
}
