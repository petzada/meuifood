// Regras puras do Cupom (Ticket 13; decisões 45, 62, 63, 66): código, validade por data e dia da
// semana no fuso America/Sao_Paulo, cálculo do desconto (% com teto opcional ou R$) e elegibilidade
// do Cupom de boas-vindas. Sem banco: a api aplica estas regras na cotação e na criação do Pedido e
// manda as condições para a escrita (uso contado de forma atômica com o Pedido).
//
// - O desconto incide SÓ sobre o subtotal dos itens: nunca sobre a taxa de Delivery (P-CUP-2,
//   sem Cupom de frete) e nunca deixa o total abaixo da taxa (desconto ≤ subtotal).
// - Pedido mínimo do Cupom compara com o subtotal dos itens (como o pedido mínimo do Delivery).
// - Validade: `startsOn`/`endsOn` são datas civis de São Paulo, inclusivas; dias da semana em
//   máscara ISO (bit 0 = segunda … bit 6 = domingo); máscara 0 = todos os dias (P-CUP-3).
import { z } from "zod";

import { centsSchema, formatBRL, MAX_CENTS, percentOfCents } from "../money.js";
import { saoPauloCivil, type Weekday, WEEKDAYS } from "../order/hours.js";

export const COUPON_CODE_MIN = 3;
export const COUPON_CODE_MAX = 20;
export const COUPON_KINDS = ["percent", "fixed"] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];
/** Máscara com os 7 dias. */
export const COUPON_WEEKDAYS_ALL = 127;

/** Código digitado pelo Consumidor ou pelo Dono: aparado, maiúsculas automáticas, A–Z 0–9 _ -. */
export const couponCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(COUPON_CODE_MIN)
      .max(COUPON_CODE_MAX)
      .regex(/^[A-Z0-9_-]+$/u, "use letras, números, _ ou -"),
  );

/** Desconto: % (1–100, teto em R$ opcional, P-CUP-1) ou valor fixo em R$. */
export type CouponDiscountRule =
  | { kind: "percent"; percent: number; maxDiscountCents: number | null }
  | { kind: "fixed"; amountCents: number };

/** Regras de uso conferidas na cotação (o limite de usos é conferido de novo na escrita). */
export type CouponUsageRule = CouponDiscountRule & {
  active: boolean;
  minOrderCents: number | null;
  startsOn: string | null;
  endsOn: string | null;
  weekdaysMask: number;
  usageLimit: number | null;
  usedCount: number;
};

// ---- Dias da semana ---------------------------------------------------------------------

export function weekdaysToMask(weekdays: readonly number[]): number {
  let mask = 0;
  for (const day of weekdays) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new RangeError(`cupom: dia da semana inválido: ${day}`);
    }
    mask |= 1 << (day - 1);
  }
  return mask;
}

/** Dias marcados em ordem (1 = segunda … 7 = domingo); máscara 0 = lista vazia (todos os dias). */
export function maskToWeekdays(mask: number): Weekday[] {
  return WEEKDAYS.filter((day) => (mask & (1 << (day - 1))) !== 0);
}

/** O dia ISO vale na máscara? Nenhum dia marcado (0) = todos os dias. */
export function maskIncludes(mask: number, weekday: number): boolean {
  return mask === 0 || mask === COUPON_WEEKDAYS_ALL || (mask & (1 << (weekday - 1))) !== 0;
}

/** Ordem do Storefront/Painel: D S T Q Q S S (domingo primeiro), como no Anota (P-CUP-3). */
export const WEEKDAY_PICKER_ORDER: readonly Weekday[] = [7, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_SHORT_PT: Readonly<Record<Weekday, string>> = {
  1: "S",
  2: "T",
  3: "Q",
  4: "Q",
  5: "S",
  6: "S",
  7: "D",
};

// ---- Data civil de São Paulo ------------------------------------------------------------

/** `YYYY-MM-DD` e dia ISO da semana em São Paulo no instante. */
export function saoPauloDay(epochMs: number): { date: string; weekday: Weekday } {
  const civil = saoPauloCivil(epochMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${civil.year}-${pad(civil.month)}-${pad(civil.day)}`,
    weekday: civil.weekday as Weekday,
  };
}

// ---- Cálculo do desconto ----------------------------------------------------------------

/**
 * Desconto em centavos sobre o subtotal dos itens: % com arredondamento meio-para-cima e teto
 * opcional, ou valor fixo; nunca maior que o subtotal (total nunca abaixo da taxa de Delivery) e
 * nunca negativo. A taxa de Delivery não entra (P-CUP-2).
 */
export function couponDiscountCents(rule: CouponDiscountRule, itemsSubtotalCents: number): number {
  if (!Number.isSafeInteger(itemsSubtotalCents) || itemsSubtotalCents < 0) {
    throw new RangeError("cupom: subtotal inválido");
  }
  const raw =
    rule.kind === "percent"
      ? Math.min(
          percentOfCents(itemsSubtotalCents, rule.percent),
          rule.maxDiscountCents ?? MAX_CENTS,
        )
      : rule.amountCents;
  return Math.max(0, Math.min(raw, itemsSubtotalCents));
}

// ---- Validade ---------------------------------------------------------------------------

export const COUPON_REJECTIONS = [
  "not_found",
  "inactive",
  "not_started",
  "expired",
  "not_today",
  "exhausted",
  "below_minimum",
  "no_discount",
] as const;
export type CouponRejection = (typeof COUPON_REJECTIONS)[number];

export type CouponEvaluation =
  | { ok: true; discountCents: number }
  | { ok: false; reason: Exclude<CouponRejection, "below_minimum"> }
  | { ok: false; reason: "below_minimum"; minimumCents: number };

/**
 * Cupom vale agora para este subtotal? Ordem dos motivos = o que o Consumidor resolve primeiro
 * (inativo, período, dia, esgotado, mínimo). Inativo é "não encontrado" para quem digita (o Dono
 * desligou: não confirma que o código existe).
 */
export function evaluateCoupon(
  rule: CouponUsageRule,
  input: { nowMs: number; itemsSubtotalCents: number },
): CouponEvaluation {
  if (!rule.active) return { ok: false, reason: "inactive" };
  const today = saoPauloDay(input.nowMs);
  if (rule.startsOn !== null && today.date < rule.startsOn) {
    return { ok: false, reason: "not_started" };
  }
  if (rule.endsOn !== null && today.date > rule.endsOn) return { ok: false, reason: "expired" };
  if (!maskIncludes(rule.weekdaysMask, today.weekday)) return { ok: false, reason: "not_today" };
  if (rule.usageLimit !== null && rule.usedCount >= rule.usageLimit) {
    return { ok: false, reason: "exhausted" };
  }
  if (rule.minOrderCents !== null && input.itemsSubtotalCents < rule.minOrderCents) {
    return { ok: false, reason: "below_minimum", minimumCents: rule.minOrderCents };
  }
  const discountCents = couponDiscountCents(rule, input.itemsSubtotalCents);
  if (discountCents <= 0) return { ok: false, reason: "no_discount" };
  return { ok: true, discountCents };
}

/** Status na lista do Painel (CUP-01): Ativo, Inativo, Expirado ou Esgotado. */
export type CouponStatus = "active" | "inactive" | "expired" | "exhausted" | "scheduled";

export function couponStatus(
  rule: Pick<CouponUsageRule, "active" | "startsOn" | "endsOn" | "usageLimit" | "usedCount">,
  nowMs: number,
): CouponStatus {
  const today = saoPauloDay(nowMs).date;
  if (rule.endsOn !== null && today > rule.endsOn) return "expired";
  if (rule.usageLimit !== null && rule.usedCount >= rule.usageLimit) return "exhausted";
  if (!rule.active) return "inactive";
  if (rule.startsOn !== null && today < rule.startsOn) return "scheduled";
  return "active";
}

export const COUPON_STATUS_LABELS_PT: Readonly<Record<CouponStatus, string>> = {
  active: "Ativo",
  inactive: "Inativo",
  expired: "Expirado",
  exhausted: "Esgotado",
  scheduled: "Agendado",
};

/** Erro específico por código (U1–U4). Inativo e inexistente dão a mesma mensagem. */
export function couponRejectionMessagePt(rejection: {
  reason: CouponRejection;
  minimumCents?: number | undefined;
}): string {
  switch (rejection.reason) {
    case "not_found":
    case "inactive":
      return "Cupom não encontrado.";
    case "not_started":
      return "Este cupom ainda não está valendo.";
    case "expired":
      return "Este cupom expirou.";
    case "not_today":
      return "Este cupom não vale hoje.";
    case "exhausted":
      return "Este cupom esgotou.";
    case "below_minimum":
      return rejection.minimumCents
        ? `Este cupom vale para pedidos a partir de ${formatBRL(rejection.minimumCents)} em itens.`
        : "O pedido não atinge o mínimo do cupom.";
    case "no_discount":
      return "Este cupom não dá desconto neste pedido.";
  }
}

/** Texto curto do desconto ("10% (até R$ 15,00)", "R$ 5,00"), para resumo e lista. */
export function couponDiscountLabelPt(rule: CouponDiscountRule): string {
  if (rule.kind === "fixed") return formatBRL(rule.amountCents);
  return rule.maxDiscountCents
    ? `${rule.percent}% (até ${formatBRL(rule.maxDiscountCents)})`
    : `${rule.percent}%`;
}

// ---- Cupom de boas-vindas (decisão 66) --------------------------------------------------

/**
 * Primeira compra NA LOJA: programa ativo, Consumidor com conta (código do WhatsApp) e nenhum
 * Pedido da conta naquela Loja — Pedidos Guest com o telefone verificado contam e bloqueiam — e
 * ainda sem uso de boas-vindas ali. Uma vez por conta por Loja.
 */
export function welcomeEligible(input: {
  programActive: boolean;
  hasAccount: boolean;
  hasOrderInStore: boolean;
  alreadyRedeemedInStore: boolean;
}): boolean {
  return (
    input.programActive &&
    input.hasAccount &&
    !input.hasOrderInStore &&
    !input.alreadyRedeemedInStore
  );
}

// ---- Cupom aplicado (resposta da cotação) -----------------------------------------------

export const appliedCouponSchema = z.object({
  source: z.enum(["promo", "welcome"]),
  /** Código digitado (promo); null no boas-vindas automático. */
  code: z.string().nullable(),
  discountCents: centsSchema,
});
export type AppliedCoupon = z.infer<typeof appliedCouponSchema>;
