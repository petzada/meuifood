// Linha de estado da Loja (C1, decisão 41) e blocos do sheet "Sobre a Loja" (C6, P-5.1), a
// partir do contrato `storefrontStoreStateSchema`. Puro: só texto a partir do estado; a api é
// quem decide aberta/fechada/Pausa em America/Sao_Paulo.
import { formatBRL } from "@foode/shared/money";
import {
  CARD_BRAND_LABELS,
  WEEKDAY_LABELS_PT,
  formatEtaPt,
  paymentMethodLabelPt,
  saoPauloCivil,
  sortOpeningPeriods,
  type CardBrands,
  type StorefrontStoreState,
  type Weekday,
} from "@foode/shared/order";

export type StoreAvailability = StorefrontStoreState["availability"];

export type StoreAvailabilityView = {
  /** Checkout liberado só com a Loja aberta e sem Pausa. */
  canOrder: boolean;
  kind: StoreAvailability["state"];
  /** "Aberta até 23:00" · "Fechada · abre amanhã às 18:00" · "Em pausa · pedidos voltam em breve". */
  label: string;
};

function civilTime(iso: string): string {
  const civil = saoPauloCivil(Date.parse(iso));
  return `${String(civil.hour).padStart(2, "0")}:${String(civil.minute).padStart(2, "0")}`;
}

/** "hoje", "amanhã" ou o dia da semana, comparando datas civis em São Paulo. */
function relativeDay(targetIso: string, nowMs: number, weekday: number): string {
  const target = saoPauloCivil(Date.parse(targetIso));
  const today = saoPauloCivil(nowMs);
  const tomorrow = saoPauloCivil(nowMs + 86_400_000);
  const same = (a: typeof today, b: typeof today) =>
    a.year === b.year && a.month === b.month && a.day === b.day;
  if (same(target, today)) return "hoje";
  if (same(target, tomorrow)) return "amanhã";
  return WEEKDAY_LABELS_PT[weekday as Weekday].toLowerCase();
}

export function describeAvailability(
  availability: StoreAvailability,
  nowMs: number = Date.now(),
): StoreAvailabilityView {
  switch (availability.state) {
    case "open":
      return {
        canOrder: true,
        kind: "open",
        label: `Aberta até ${civilTime(availability.closesAt)}`,
      };
    case "paused":
      return { canOrder: false, kind: "paused", label: "Em pausa · pedidos voltam em breve" };
    case "closed": {
      const next = availability.nextOpening;
      if (!next) return { canOrder: false, kind: "closed", label: "Fechada no momento" };
      return {
        canOrder: false,
        kind: "closed",
        label: `Fechada · abre ${relativeDay(next.at, nowMs, next.weekday)} às ${next.opensAt}`,
      };
    }
  }
}

/** Mensagem do bloqueio no carrinho e no checkout (decisão 41), por estado. */
export function blockedCheckoutMessage(view: StoreAvailabilityView): string | null {
  if (view.canOrder) return null;
  return view.kind === "paused"
    ? "A Loja pausou os pedidos agora. Você pode montar o carrinho e pedir quando voltar."
    : "A Loja está fechada agora. Você pode montar o carrinho e pedir quando abrir.";
}

export type WeekdayHours = { label: string; periods: string[]; weekday: Weekday };

/** Grade Seg–Dom: dia sem período aparece como "Fechado". */
export function weeklyHours(hours: StorefrontStoreState["hours"]): WeekdayHours[] {
  const sorted = sortOpeningPeriods(hours);
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
    label: WEEKDAY_LABELS_PT[weekday],
    periods: sorted
      .filter((period) => period.weekday === weekday)
      .map((period) => `${period.opensAt}–${period.closesAt}`),
    weekday,
  }));
}

export function formatStoreAddress(
  address: NonNullable<StorefrontStoreState["pickup"]>["address"],
) {
  const line1 = [`${address.street}, ${address.number}`, address.complement]
    .filter(Boolean)
    .join(" · ");
  return { line1, line2: `${address.district} · ${address.city}/${address.state}` };
}

export function brandLines(brands: CardBrands): Array<{ label: string; names: string }> {
  const lines: Array<{ label: string; names: string }> = [];
  if (brands.debit.length > 0) {
    lines.push({
      label: "Débito",
      names: brands.debit.map((b) => CARD_BRAND_LABELS[b]).join(", "),
    });
  }
  if (brands.credit.length > 0) {
    lines.push({
      label: "Crédito",
      names: brands.credit.map((b) => CARD_BRAND_LABELS[b]).join(", "),
    });
  }
  return lines;
}

export function paymentMethodNames(state: Pick<StorefrontStoreState, "paymentMethods">): string[] {
  return state.paymentMethods.map(paymentMethodLabelPt);
}

/** Linhas de Delivery/Retirada para o sheet e o cabeçalho (só o que está configurado, P-2.4). */
export function fulfillmentSummary(state: Pick<StorefrontStoreState, "delivery" | "pickup">) {
  const lines: Array<{ detail: string | null; label: string }> = [];
  if (state.delivery) {
    const details: string[] = [];
    if (state.delivery.eta) details.push(formatEtaPt(state.delivery.eta));
    if (state.delivery.mode === "fixed") details.push(`taxa ${formatBRL(state.delivery.feeCents)}`);
    else details.push("taxa por bairro");
    if (state.delivery.minimumOrderCents !== null) {
      details.push(`pedido mínimo ${formatBRL(state.delivery.minimumOrderCents)}`);
    }
    lines.push({ detail: details.join(" · ") || null, label: "Delivery" });
  }
  if (state.pickup) {
    lines.push({
      detail: state.pickup.eta ? formatEtaPt(state.pickup.eta) : null,
      label: "Retirada na Loja",
    });
  }
  return lines;
}
