// Rótulos, tempos e textos da fila de Pedidos (Ticket 24b). Puro: serve aos componentes e aos
// testes. Estados, transições e rótulos do botão vêm do contrato (`@foode/shared/order`); aqui
// ficam só o que é apresentação do Painel (selos, tempo decorrido, aba, WhatsApp).
import { buildWhatsAppMeUrl } from "@foode/shared";
import { formatBRL } from "@foode/shared/money";
import type { BadgeTone } from "@foode/ui";
import {
  type CancellationConsequence,
  type Fulfillment,
  ONLINE_PAYMENT_METHODS,
  type OrderQueueItem,
  type OrderStatus,
  type PaymentMethod,
  type QueueColumn,
  type QueueFilter,
  queueColumnOf,
  REFUND_STATE_LABELS,
  type RefundState,
} from "@foode/shared/order";

export const FULFILLMENT_LABEL: Record<Fulfillment, string> = {
  delivery: "Delivery",
  pickup: "Retirada",
};

export const QUEUE_FILTER_LABEL: Record<QueueFilter, string> = {
  all: "Todos",
  delivery: "Delivery",
  pickup: "Retirada",
};

/** Colunas da fila (PED-01); Concluídos/Cancelados ficam fora, no link "Concluídos hoje". */
export const QUEUE_COLUMNS = ["received", "preparing", "ready"] as const satisfies QueueColumn[];
export type ActiveQueueColumn = (typeof QUEUE_COLUMNS)[number];

export const QUEUE_COLUMN_LABEL: Record<ActiveQueueColumn, string> = {
  received: "Recebidos",
  preparing: "Em preparo",
  ready: "Prontos / Saiu para entrega",
};

/** Selo de pagamento do card (PED-02): quem entrega precisa saber se cobra. */
export function paymentBadgeLabel(method: PaymentMethod): "Pago online" | "Pagar na entrega" {
  return (ONLINE_PAYMENT_METHODS as readonly PaymentMethod[]).includes(method)
    ? "Pago online"
    : "Pagar na entrega";
}

export function isPaidOnline(method: PaymentMethod): boolean {
  return paymentBadgeLabel(method) === "Pago online";
}

/** Minutos em Recebido a partir dos quais o tempo vira destaque (PED-04). */
export const LATE_RECEIVED_MINUTES = 10;

/** "agora", "há 4 min", "há 1 h 12 min" — tempo decorrido, nunca contagem regressiva (PED-04). */
export function formatElapsed(createdAtIso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(createdAtIso)) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `há ${hours} h` : `há ${hours} h ${rest} min`;
}

export function elapsedMinutes(createdAtIso: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(createdAtIso)) / 60_000));
}

/** "Atualizado há 8 s" (PED-06). */
export function formatUpdatedAgo(updatedAtMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000));
  return `Atualizado há ${seconds} s`;
}

/** Título da aba (NAV-07): conta Pedidos em Recebido ainda não abertos. */
export function tabTitle(newCount: number): string {
  return newCount > 0 ? `(${newCount}) Pedidos · Foode` : "Pedidos · Foode";
}

export function countNewUnopened(orders: readonly OrderQueueItem[], opened: ReadonlySet<string>) {
  return orders.filter((order) => order.status === "received" && !opened.has(order.id)).length;
}

/** Fila filtrada pelo chip e agrupada por coluna, mais antigos primeiro em cada coluna. */
export function groupByColumn(
  orders: readonly OrderQueueItem[],
  filter: QueueFilter,
): Record<ActiveQueueColumn, OrderQueueItem[]> {
  const groups: Record<ActiveQueueColumn, OrderQueueItem[]> = {
    received: [],
    preparing: [],
    ready: [],
  };
  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const order of sorted) {
    if (filter !== "all" && order.fulfillment !== filter) continue;
    const column = queueColumnOf(order.status);
    if (column === "closed") continue;
    groups[column].push(order);
  }
  return groups;
}

/** Hora civil de São Paulo, "HH:MM". */
export function formatTimeSp(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** Data e hora de São Paulo para o cupom: "05/11/2026 18:42". */
export function formatDateTimeSpShort(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(",", "");
}

/** Toast específico da ação rápida (T-05): "Pedido #123 em preparo". */
export function transitionToast(code: number, to: OrderStatus): string {
  switch (to) {
    case "preparing":
      return `Pedido #${code} em preparo.`;
    case "ready_for_pickup":
      return `Pedido #${code} pronto para retirada.`;
    case "out_for_delivery":
      return `Pedido #${code} saiu para entrega.`;
    case "completed":
      return `Pedido #${code} concluído.`;
    case "cancelled":
      return `Pedido #${code} cancelado.`;
    case "received":
      return `Pedido #${code} recebido.`;
  }
}

/**
 * Toast do cancelamento (Ticket 12, CAN-01/CAN-02): nomeia o Pedido e a consequência que a api
 * produziu. O Estorno segue com selo próprio no card e no detalhe.
 */
export function cancelToast(code: number, consequence: CancellationConsequence): string {
  switch (consequence.kind) {
    case "on_delivery":
      return `Pedido #${code} cancelado.`;
    case "refund":
      return `Pedido #${code} cancelado. Estorno de ${formatBRL(consequence.refund.amountCents)} em andamento.`;
    case "charge_cancel":
      return `Pedido #${code} cancelado. A cobrança foi cancelada.`;
  }
}

/**
 * Selo do Estorno (CAN-02, T-03: texto + símbolo + cor), separado do status do Pedido. O texto
 * vem do contrato (`REFUND_STATE_LABELS`); aqui só a apresentação.
 */
export const REFUND_BADGE: Record<RefundState, { label: string; symbol: string; tone: BadgeTone }> =
  {
    pending: { label: REFUND_STATE_LABELS.pending, symbol: "…", tone: "accent" },
    succeeded: { label: REFUND_STATE_LABELS.succeeded, symbol: "✓", tone: "success" },
    failed_retrying: { label: REFUND_STATE_LABELS.failed_retrying, symbol: "!", tone: "error" },
  };

/**
 * Texto fixo por status do "Avisar no WhatsApp" (P-WPP-1, decisão 64). Sempre com o link de
 * acompanhamento; a Loja decide quando enviar (nada automático).
 */
export function whatsappMessageFor(input: {
  status: OrderStatus;
  fulfillment: Fulfillment;
  code: number;
  customerFirstName: string;
  storeName: string;
  trackingUrl: string;
}): string {
  const { code, customerFirstName, storeName, trackingUrl } = input;
  const greeting = `Olá, ${customerFirstName}! Aqui é da ${storeName}.`;
  const body = (() => {
    switch (input.status) {
      case "received":
        return `Recebemos o seu Pedido #${code} e já vamos começar o preparo.`;
      case "preparing":
        return `O seu Pedido #${code} está sendo preparado.`;
      case "ready_for_pickup":
        return `O seu Pedido #${code} está pronto para retirada na Loja.`;
      case "out_for_delivery":
        return `O seu Pedido #${code} saiu para entrega.`;
      case "completed":
        return input.fulfillment === "delivery"
          ? `O seu Pedido #${code} foi entregue. Obrigado pela preferência!`
          : `O seu Pedido #${code} foi retirado. Obrigado pela preferência!`;
      case "cancelled":
        return `O seu Pedido #${code} foi cancelado. Se tiver dúvida, é só responder aqui.`;
    }
  })();
  return `${greeting} ${body}\nAcompanhe por aqui: ${trackingUrl}`;
}

/** URL `wa.me` para o telefone E.164 do Consumidor com o texto pronto; null se o telefone não é celular. */
export function whatsappUrl(phoneE164: string, text: string): string | null {
  return buildWhatsAppMeUrl(phoneE164, text);
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/u)[0] ?? "";
}

/** Rodapé fixo do cupom (P-IMP-2). */
export const RECEIPT_FOOTER = "Pedido feito pela Foode Delivery";

/** Chave do tour da fila no localStorage, por usuário (P-ONB-1: não se repete). */
export function tourStorageKey(userId: string): string {
  return `foode.painel.tour-fila.v1:${userId}`;
}
