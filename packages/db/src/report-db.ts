// Relatórios do Dono no D1 (Ticket 14; REL-01, P-REL-2..5). Só leitura, só o Dono (`forbidden` para
// Operador) e SEMPRE na Loja do contexto. Uma ida ao banco (`batch`) com agregados por GROUP BY,
// sem N+1: Pedidos por (status, Fulfillment, meio) no período e no anterior, itens × dia da semana,
// TOP 10 clientes com conta e contadores do funil. A api monta a visão com @foode/shared/finance.
//
// Pedidos contados = os que o Painel enxerga (`PAINEL_VISIBLE_PAYMENT_SQL`: pagos ou sem pagamento
// online), criados no intervalo UTC equivalente aos dias civis de São Paulo.
//
// TOP 10 clientes — base legal (LGPD art. 7º, V e IX): execução do contrato de fornecimento entre
// Consumidor e Loja e legítimo interesse do Dono em conhecer os clientes recorrentes DA PRÓPRIA
// Loja. Dado mínimo: só o nome da conta Foode, a quantidade e o total. Só Pedidos com
// `customer_account_id` (conta na Foode): Guest nunca aparece. Telefone, CPF e endereço nunca
// saem desta consulta.
import type { StoreContext } from "./context";
import { FoodeDbError } from "./errors";
import { PAINEL_VISIBLE_PAYMENT_SQL } from "./schema/orders";

export type ReportUtcRange = { fromUtc: string; toUtc: string };

export type ReportQuery = {
  current: ReportUtcRange;
  previous: ReportUtcRange;
  /** Dias civis [from, to] do funil (o contador é por dia de São Paulo). */
  from: string;
  to: string;
};

export type ReportOrderRow = {
  status:
    "received" | "preparing" | "ready_for_pickup" | "out_for_delivery" | "completed" | "cancelled";
  fulfillment: "delivery" | "pickup";
  paymentMethod: "pix" | "credit" | "on_delivery";
  orders: number;
  totalCents: number;
};

export type ReportItemRow = {
  itemKey: string;
  itemName: string;
  weekday: number;
  quantity: number;
  totalCents: number;
};

export type ReportCustomerAggregate = { name: string; orders: number; totalCents: number };

export type ReportFunnelRow = {
  day: string;
  event: "visit" | "item_view" | "add_to_cart" | "checkout_start" | "order";
  count: number;
};

export type ReportRows = {
  current: ReportOrderRow[];
  previous: ReportOrderRow[];
  items: ReportItemRow[];
  customers: ReportCustomerAggregate[];
  funnel: ReportFunnelRow[];
};

/**
 * Deslocamento de São Paulo para o dia da semana no SQLite. O Brasil não tem horário de verão
 * desde 2019; os limites do período usam o Intl (@foode/shared/finance), só o Dom–Sáb usa isto.
 */
const SAO_PAULO_SQL_OFFSET = "-3 hours";

const VISIBLE = PAINEL_VISIBLE_PAYMENT_SQL.replace("payment_status", "o.payment_status");

export function createReportOps(d1: D1Database, context: StoreContext) {
  const storeId = context.storeId;

  function aggregate(range: ReportUtcRange): D1PreparedStatement {
    return d1
      .prepare(
        `SELECT o.status AS status, o.fulfillment AS fulfillment, o.payment_method AS paymentMethod,
                count(*) AS orders, coalesce(sum(o.total_cents), 0) AS totalCents
         FROM orders o
         WHERE o.store_id = ? AND ${VISIBLE} AND o.created_at >= ? AND o.created_at < ?
         GROUP BY o.status, o.fulfillment, o.payment_method`,
      )
      .bind(storeId, range.fromUtc, range.toUtc);
  }

  return {
    /** Agregados do período e do anterior, itens, TOP 10 clientes e funil, num só `batch`. */
    async report(query: ReportQuery): Promise<ReportRows> {
      if (context.role !== "owner") throw new FoodeDbError("forbidden");
      const { current } = query;
      const [now, before, items, customers, funnel] = await d1.batch([
        aggregate(current),
        aggregate(query.previous),
        d1
          .prepare(
            `SELECT coalesce(l.menu_item_id, 'nome:' || l.item_name) AS itemKey,
                    max(l.item_name) AS itemName,
                    CAST(strftime('%w', o.created_at, '${SAO_PAULO_SQL_OFFSET}') AS INTEGER) AS weekday,
                    sum(l.quantity) AS quantity, sum(l.line_total_cents) AS totalCents
             FROM order_lines l
             JOIN orders o ON o.store_id = l.store_id AND o.id = l.order_id
             WHERE o.store_id = ? AND o.status <> 'cancelled' AND ${VISIBLE}
               AND o.created_at >= ? AND o.created_at < ?
             GROUP BY itemKey, weekday`,
          )
          .bind(storeId, current.fromUtc, current.toUtc),
        d1
          .prepare(
            `SELECT a.name AS name, count(*) AS orders, sum(o.total_cents) AS totalCents
             FROM orders o
             JOIN customer_accounts a ON a.id = o.customer_account_id
             WHERE o.store_id = ? AND o.customer_account_id IS NOT NULL
               AND o.status <> 'cancelled' AND ${VISIBLE}
               AND o.created_at >= ? AND o.created_at < ?
             GROUP BY a.id
             ORDER BY totalCents DESC, orders DESC, a.name ASC
             LIMIT 10`,
          )
          .bind(storeId, current.fromUtc, current.toUtc),
        d1
          .prepare(
            `SELECT day, event, count FROM store_funnel_daily
             WHERE store_id = ? AND day BETWEEN ? AND ? ORDER BY day, event`,
          )
          .bind(storeId, query.from, query.to),
      ]);
      return {
        current: (now?.results ?? []) as ReportOrderRow[],
        previous: (before?.results ?? []) as ReportOrderRow[],
        items: (items?.results ?? []) as ReportItemRow[],
        customers: (customers?.results ?? []) as ReportCustomerAggregate[],
        funnel: (funnel?.results ?? []) as ReportFunnelRow[],
      };
    },
  };
}

export type ReportOps = ReturnType<typeof createReportOps>;
