// Funil próprio do Storefront (Ticket 28 grava; Ticket 14 lê; P-REL-4, decisão 63): visita →
// item → carrinho → checkout → Pedido, contadores agregados por Loja e dia civil de São Paulo.
// Sem dado pessoal: nada de IP, telefone, cookie de identificação ou id de Consumidor no corpo
// nem no banco. O Pixel não é fonte do funil.
import { z } from "zod";

import { saoPauloCivil } from "../order/hours.js";

export const FUNNEL_EVENTS = [
  "visit",
  "item_view",
  "add_to_cart",
  "checkout_start",
  "order",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/**
 * Eventos que o navegador envia. `order` é contado pela própria api quando o Pedido é criado
 * (não aceita do cliente: o passo final do funil não pode ser inflado de fora).
 */
export const CLIENT_FUNNEL_EVENTS = [
  "visit",
  "item_view",
  "add_to_cart",
  "checkout_start",
] as const satisfies readonly FunnelEvent[];
export type ClientFunnelEvent = (typeof CLIENT_FUNNEL_EVENTS)[number];

/**
 * Corpo de `POST /storefront/lojas/:slug/eventos`: só o nome do evento (`.strict()`: qualquer
 * outro campo, como id ou telefone, é recusado). 204 = contado; 429 = rate limit por IP.
 */
export const funnelEventRequestSchema = z.object({ event: z.enum(CLIENT_FUNNEL_EVENTS) }).strict();
export type FunnelEventRequest = z.infer<typeof funnelEventRequestSchema>;

/** Eventos por IP (hash truncado, só na chave do rate limit) e Loja por janela. */
export const FUNNEL_EVENT_RATE_LIMIT = { max: 60, windowSeconds: 300 } as const;

/** Dia civil `YYYY-MM-DD` em America/Sao_Paulo (chave do contador). */
export function funnelDay(epochMs: number): string {
  const civil = saoPauloCivil(epochMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${civil.year}-${pad(civil.month)}-${pad(civil.day)}`;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export const funnelDaySchema = z
  .string()
  .regex(DAY_PATTERN)
  .refine((day) => {
    const date = new Date(`${day}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
  }, "Data inválida.");

/** Período máximo do relatório (dias, inclusivo). */
export const FUNNEL_REPORT_MAX_DAYS = 92;

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** Leitura do funil da Loja ativa (Ticket 14): período [from, to] em dias civis, inclusivo. */
export const funnelReportInputSchema = z
  .object({ from: funnelDaySchema, to: funnelDaySchema })
  .refine((input) => input.from <= input.to, { message: "Início depois do fim.", path: ["to"] })
  .refine((input) => daysBetween(input.from, input.to) < FUNNEL_REPORT_MAX_DAYS, {
    message: `Período de até ${FUNNEL_REPORT_MAX_DAYS} dias.`,
    path: ["to"],
  });
export type FunnelReportInput = z.input<typeof funnelReportInputSchema>;

export type FunnelCounts = Record<FunnelEvent, number>;

export type FunnelDayRow = { day: string } & FunnelCounts;

/** Linha agregada como sai do D1. */
export type FunnelCounterRow = { day: string; event: FunnelEvent; count: number };

export type FunnelReport = {
  from: string;
  to: string;
  /** Um registro por dia do período (dia sem evento = zeros), em ordem. */
  days: FunnelDayRow[];
  totals: FunnelCounts;
  /**
   * Conversão de cada passo sobre o anterior, em basis points (10000 = 100%); null quando o
   * passo anterior é zero. `visit` não tem anterior.
   */
  stepConversionBps: Record<Exclude<FunnelEvent, "visit">, number | null>;
};

export function emptyFunnelCounts(): FunnelCounts {
  return { visit: 0, item_view: 0, add_to_cart: 0, checkout_start: 0, order: 0 };
}

function listDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= Date.parse(`${to}T00:00:00Z`);) {
    days.push(new Date(at).toISOString().slice(0, 10));
    at += 86_400_000;
  }
  return days;
}

/** Monta o relatório a partir dos contadores (linhas fora do período são ignoradas). */
export function buildFunnelReport(
  from: string,
  to: string,
  rows: readonly FunnelCounterRow[],
): FunnelReport {
  const byDay = new Map(listDays(from, to).map((day) => [day, emptyFunnelCounts()]));
  const totals = emptyFunnelCounts();
  for (const row of rows) {
    const counts = byDay.get(row.day);
    if (!counts || !FUNNEL_EVENTS.includes(row.event)) continue;
    counts[row.event] += row.count;
    totals[row.event] += row.count;
  }
  const rate = (step: number, previous: number) =>
    previous > 0 ? Math.round((step / previous) * 10_000) : null;
  return {
    from,
    to,
    days: [...byDay].map(([day, counts]) => ({ day, ...counts })),
    totals,
    stepConversionBps: {
      item_view: rate(totals.item_view, totals.visit),
      add_to_cart: rate(totals.add_to_cart, totals.item_view),
      checkout_start: rate(totals.checkout_start, totals.add_to_cart),
      order: rate(totals.order, totals.checkout_start),
    },
  };
}
