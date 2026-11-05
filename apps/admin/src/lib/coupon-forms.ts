// Formulários de Cupons do Painel (Ticket 13; CUP-02/CUP-03, P-CUP-1/3/5): lê o FormData do
// navegador, converte R$/% para centavos/inteiro e valida com os Zod do contrato
// (`@foode/shared/coupon`); a api valida de novo. Também o resumo vivo do Cupom (texto único
// para o formulário e para a lista) e os rótulos PT-BR. Puro: roda no navegador e no servidor.
import {
  COUPON_CODE_MAX,
  COUPON_CODE_MIN,
  WEEKDAY_PICKER_ORDER,
  couponCreateInputSchema,
  couponDiscountLabelPt,
  couponSetActiveInputSchema,
  couponRefInputSchema,
  couponUpdateInputSchema,
  welcomeCouponInputSchema,
  type CouponDiscountRule,
  type CouponTemplate,
  type CouponView,
} from "@foode/shared/coupon";
import { formatBRL } from "@foode/shared/money";
import type { Weekday } from "@foode/shared/order";

import { parseMoneyToCents } from "./ops-format";
import { type FormLike, parseWith, text } from "./ops-forms";

const COUPON_MESSAGES: Record<string, string> = {
  code: `Use ${COUPON_CODE_MIN} a ${COUPON_CODE_MAX} letras, números, _ ou -.`,
  "custom:use letras, números, _ ou -": "Use só letras, números, _ ou -.",
  percent: "Informe o percentual de 1 a 100.",
  amountCents: "Informe o valor em R$ (ex.: 5,00).",
  maxDiscountCents: "Informe o teto em R$ (ex.: 20,00) ou deixe vazio.",
  minOrderCents: "Informe o pedido mínimo em R$ ou deixe vazio.",
  startsOn: "Informe uma data válida (AAAA-MM-DD).",
  endsOn: "Informe uma data válida (AAAA-MM-DD).",
  "custom:o fim precisa ser depois do início": "A validade precisa terminar depois de começar.",
  "custom:use AAAA-MM-DD": "Informe uma data válida.",
  "custom:data inválida": "Informe uma data válida.",
  usageLimit: "Informe um número inteiro de usos ou deixe vazio.",
  weekdays: "Escolha dias válidos.",
  kind: "Escolha o tipo do desconto.",
};

function optionalMoney(form: FormLike, name: string): number | null {
  const raw = text(form, name).trim();
  if (!raw) return null;
  return parseMoneyToCents(raw) ?? Number.NaN;
}

function requiredMoney(form: FormLike, name: string): number {
  return parseMoneyToCents(text(form, name).trim()) ?? Number.NaN;
}

function optionalInteger(form: FormLike, name: string): number | null {
  const raw = text(form, name).trim();
  if (!raw) return null;
  return /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
}

function requiredInteger(form: FormLike, name: string): number {
  const raw = text(form, name).trim().replace("%", "");
  return /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
}

function optionalDate(form: FormLike, name: string): string | null {
  const raw = text(form, name).trim();
  return raw ? raw : null;
}

function checked(form: FormLike, name: string): boolean {
  const value = text(form, name);
  return value === "on" || value === "true";
}

/** Desconto como o formulário manda: `kind` + campos do tipo escolhido. */
function readDiscount(form: FormLike) {
  const kind = text(form, "kind");
  if (kind === "fixed") return { kind, amountCents: requiredMoney(form, "amountCents") };
  return {
    kind,
    percent: requiredInteger(form, "percent"),
    maxDiscountCents: optionalMoney(form, "maxDiscountCents"),
  };
}

function readCouponFields(form: FormLike) {
  return {
    ...readDiscount(form),
    code: text(form, "code"),
    minOrderCents: optionalMoney(form, "minOrderCents"),
    startsOn: optionalDate(form, "startsOn"),
    endsOn: optionalDate(form, "endsOn"),
    weekdays: form
      .getAll("weekdays")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value)),
    usageLimit: optionalInteger(form, "usageLimit"),
    active: checked(form, "active"),
  };
}

export function parseCouponCreate(form: FormLike) {
  return parseWith(couponCreateInputSchema, readCouponFields(form), COUPON_MESSAGES);
}

export function parseCouponUpdate(form: FormLike, couponId: string) {
  return parseWith(
    couponUpdateInputSchema,
    { ...readCouponFields(form), couponId },
    COUPON_MESSAGES,
  );
}

export function parseCouponRef(form: FormLike) {
  return parseWith(couponRefInputSchema, { couponId: text(form, "couponId") }, COUPON_MESSAGES);
}

export function parseCouponSetActive(form: FormLike) {
  return parseWith(
    couponSetActiveInputSchema,
    { couponId: text(form, "couponId"), active: text(form, "active") === "true" },
    COUPON_MESSAGES,
  );
}

export function parseWelcomeCoupon(form: FormLike) {
  return parseWith(
    welcomeCouponInputSchema,
    {
      ...readDiscount(form),
      active: checked(form, "active"),
      minOrderCents: optionalMoney(form, "minOrderCents"),
    },
    COUPON_MESSAGES,
  );
}

// ---- Resumo vivo (CUP-03) ----------------------------------------------------------------

export const WEEKDAY_LONG_PT: Readonly<Record<Weekday, string>> = {
  1: "segunda",
  2: "terça",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sábado",
  7: "domingo",
};

/** "seg, ter e qua" na ordem D S T Q Q S S; vazio = "todos os dias". */
export function weekdaysLabelPt(weekdays: readonly number[]): string {
  const chosen = WEEKDAY_PICKER_ORDER.filter((day) => weekdays.includes(day));
  if (chosen.length === 0 || chosen.length === 7) return "todos os dias";
  const names = chosen.map((day) => WEEKDAY_LONG_PT[day]);
  if (names.length === 1) return `só ${names[0]}`;
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" sem passar por fuso. */
export function formatCivilDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function validityLabelPt(startsOn: string | null, endsOn: string | null): string {
  if (startsOn && endsOn) return `de ${formatCivilDate(startsOn)} a ${formatCivilDate(endsOn)}`;
  if (startsOn) return `a partir de ${formatCivilDate(startsOn)}`;
  if (endsOn) return `até ${formatCivilDate(endsOn)}`;
  return "sem validade";
}

export type CouponSummaryInput = {
  discount: CouponDiscountRule | null;
  endsOn: string | null;
  minOrderCents: number | null;
  startsOn: string | null;
  usageLimit: number | null;
  weekdays: readonly number[];
};

/**
 * Frase única do Cupom, atualizada enquanto o Dono digita: "10% de desconto (até R$ 20,00) em
 * Pedidos a partir de R$ 30,00, de segunda a quinta, até 100 usos, válido até 30/11/2026."
 */
export function couponSummaryPt(input: CouponSummaryInput): string {
  if (!input.discount) return "Escolha o tipo e o valor do desconto para ver o resumo.";
  const parts: string[] = [`${couponDiscountLabelPt(input.discount)} de desconto`];
  parts.push(
    input.minOrderCents
      ? `em Pedidos a partir de ${formatBRL(input.minOrderCents)} em itens`
      : "em qualquer Pedido",
  );
  const days = weekdaysLabelPt(input.weekdays);
  if (days !== "todos os dias") parts.push(days);
  if (input.usageLimit)
    parts.push(`até ${input.usageLimit} uso${input.usageLimit === 1 ? "" : "s"}`);
  const validity = validityLabelPt(input.startsOn, input.endsOn);
  parts.push(validity === "sem validade" ? "sem data para acabar" : `válido ${validity}`);
  return `${parts.join(", ")}. O desconto nunca vale para a taxa de entrega.`;
}

/** Texto do que o Consumidor recebe no boas-vindas (CUP-04). */
export function welcomeSummaryPt(input: {
  active: boolean;
  discount: CouponDiscountRule | null;
  minOrderCents: number | null;
}): string {
  if (!input.discount) return "Escolha o desconto para ver o que o Consumidor recebe.";
  const minimum = input.minOrderCents
    ? ` em Pedidos a partir de ${formatBRL(input.minOrderCents)} em itens`
    : "";
  const base = `Quem entra com a conta Foode e faz a primeira compra nesta Loja ganha ${couponDiscountLabelPt(input.discount)} de desconto${minimum}, aplicado sozinho no checkout, uma vez por conta.`;
  return input.active ? base : `${base} (Programa desligado: ninguém recebe até você ligar.)`;
}

// ---- Valores iniciais do formulário ---------------------------------------------------------

export type CouponFormValues = {
  active: boolean;
  amountCents: number | null;
  code: string;
  endsOn: string | null;
  kind: "percent" | "fixed";
  maxDiscountCents: number | null;
  minOrderCents: number | null;
  percent: number | null;
  startsOn: string | null;
  usageLimit: number | null;
  weekdays: number[];
};

export const EMPTY_COUPON: CouponFormValues = {
  active: true,
  amountCents: null,
  code: "",
  endsOn: null,
  kind: "percent",
  maxDiscountCents: null,
  minOrderCents: null,
  percent: null,
  startsOn: null,
  usageLimit: null,
  weekdays: [],
};

export function couponFormValues(coupon: CouponView): CouponFormValues {
  return {
    active: coupon.active,
    amountCents: coupon.discount.kind === "fixed" ? coupon.discount.amountCents : null,
    code: coupon.code,
    endsOn: coupon.endsOn,
    kind: coupon.discount.kind,
    maxDiscountCents: coupon.discount.kind === "percent" ? coupon.discount.maxDiscountCents : null,
    minOrderCents: coupon.minOrderCents,
    percent: coupon.discount.kind === "percent" ? coupon.discount.percent : null,
    startsOn: coupon.startsOn,
    usageLimit: coupon.usageLimit,
    weekdays: coupon.weekdays,
  };
}

/** Modelo só preenche o formulário (CUP-05): o Dono ainda escolhe o código e salva. */
export function applyTemplate(
  current: CouponFormValues,
  template: CouponTemplate,
): CouponFormValues {
  return {
    ...current,
    amountCents: template.fill.amountCents,
    code: current.code || template.fill.suggestedCode,
    kind: template.fill.kind,
    maxDiscountCents: template.fill.maxDiscountCents,
    minOrderCents: template.fill.minOrderCents,
    percent: template.fill.percent,
    usageLimit: template.fill.usageLimit,
    weekdays: [...template.fill.weekdays],
  };
}

export function discountFromValues(values: CouponFormValues): CouponDiscountRule | null {
  if (values.kind === "fixed") {
    return values.amountCents && values.amountCents > 0
      ? { kind: "fixed", amountCents: values.amountCents }
      : null;
  }
  return values.percent && values.percent > 0 && values.percent <= 100
    ? { kind: "percent", maxDiscountCents: values.maxDiscountCents, percent: values.percent }
    : null;
}
