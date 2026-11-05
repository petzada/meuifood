// Repasses e lotes diários no D1 (Ticket 14, migration 0012; decisões 60, 61 e 71; REL-04, OPS-04).
//
// Dono (`db.store(context).payouts()`, só `owner`): linhas da tela Repasses e lotes pagos da
// própria Loja. Nunca custo do provedor nem custo do envio.
// Ops (`db.ops(context)`): "A repassar hoje", marcar lote pago, ajuste auditado, lotes e margem.
//
// Item pendente (o que entra no próximo lote da Loja):
// - lançamento: `ledger_entries` com repasse previsto até o corte, sem `ledger_entry_payouts` e sem
//   anulação; vale o líquido menos as retenções do provedor (que têm data própria);
// - retenção: `ledger_retentions` com previsão até o corte, fora de lote, lançamento não anulado;
// - débito: `ledger_reversals` `compensated_debit` com previsão até o corte, fora de lote;
// - ajuste: `payout_adjustments` fora de lote (qualquer data).
// O Estorno antes do repasse (anulação) tira o lançamento do lote; depois do repasse vira débito
// (Ticket 12 decide pelo `ledger_entry_payouts`, que o lote pago grava).
//
// Lote pago: um único `batch` atômico grava o lote, os itens (UNIQUE kind+item_id: nada é pago
// duas vezes), `ledger_entry_payouts` dos lançamentos (PK: nada repassado duas vezes) e a
// auditoria; uma guarda derruba o batch se algum lançamento foi anulado entre a leitura e a
// escrita. `idempotency_key` UNIQUE: repetir devolve o mesmo lote. Lote é IMUTÁVEL: nada aqui faz
// UPDATE/DELETE em `payout_batches`/`payout_batch_items`; correção = ajuste auditado.
import type { OpsContext, StoreContext } from "./context";
import { newId, utcNow } from "./conventions";
import { FoodeDbError, isUniqueViolation } from "./errors";

export type PayoutItemKindValue = "entry" | "retention" | "debit" | "adjustment";
export type PayoutSourceAccountValue = "efi" | "abacatepay";

export type PendingPayoutItem = {
  kind: PayoutItemKindValue;
  id: string;
  storeId: string;
  amountCents: number;
  orderCode: number | null;
  method: "pix" | "credit" | null;
  expectedPayoutDate: string | null;
  reason: string | null;
};

export type PayoutStoreRow = {
  storeId: string;
  storeName: string;
  storeSlug: string;
  pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null;
  pixKey: string | null;
  holderName: string | null;
};

export type OwnerPayoutLineRow = {
  id: string;
  kind: "payment" | "retention" | "refund_debit" | "adjustment";
  orderCode: number | null;
  method: "pix" | "credit" | null;
  cardMode: "normal" | "rapido" | null;
  orderTotalCents: number;
  foodeFeeCents: number;
  serviceFeeCents: number;
  netCents: number;
  expectedPayoutDate: string | null;
  paid: number;
  annulled: number;
  batchId: string | null;
  reason: string | null;
  occurredAt: string;
};

export type PayoutBatchRowView = {
  id: string;
  storeId: string;
  payoutDate: string;
  paidOn: string;
  sourceAccount: PayoutSourceAccountValue;
  reference: string;
  transferCostCents: number;
  entriesCents: number;
  debitsCents: number;
  adjustmentsCents: number;
  amountCents: number;
  itemCount: number;
  createdByUserId: string;
  createdAt: string;
};

export type MarkPayoutPaidData = {
  storeId: string;
  asOf: string;
  paidOn: string;
  sourceAccount: PayoutSourceAccountValue;
  reference: string;
  transferCostCents: number;
  expectedAmountCents: number;
  idempotencyKey: string;
};

export type MarkPayoutPaidOutcome = {
  batchId: string;
  amountCents: number;
  itemCount: number;
  replayed: boolean;
};

export type PayoutAdjustmentData = {
  storeId: string;
  amountCents: number;
  reason: string;
  batchId: string | null;
};

export type MarginStoreRow = {
  storeId: string;
  storeName: string;
  payments: number;
  foodeFeeCents: number;
  refundedFoodeFeeCents: number;
  serviceFeeCents: number;
  refundedServiceFeeCents: number;
  providerCostCents: number;
  providerCostUnknown: number;
  transferCostCents: number;
  batches: number;
};

/** Ações de auditoria do Ticket 14 (`audit_events.action`). */
export const PAYOUT_AUDIT_ACTIONS = ["payout.batch_paid", "payout.adjustment_created"] as const;

const NOT_ANNULLED = (entryColumn: string) =>
  `NOT EXISTS (SELECT 1 FROM ledger_reversals v WHERE v.ledger_entry_id = ${entryColumn} AND v.kind = 'annulment')`;
const NOT_IN_BATCH = (kind: PayoutItemKindValue, column: string) =>
  `NOT EXISTS (SELECT 1 FROM payout_batch_items i WHERE i.kind = '${kind}' AND i.item_id = ${column})`;
const RETAINED = `coalesce((SELECT sum(r2.amount_cents) FROM ledger_retentions r2 WHERE r2.ledger_entry_id = e.id), 0)`;

/**
 * Itens pendentes com previsão até `asOf` (`storeFilter` = `?` para uma Loja, `1` para todas).
 * Os quatro blocos usam o mesmo filtro de Loja; parâmetros: [asOf, store?] × 3 + [store?].
 */
function pendingItemsSql(storeFilter: "one" | "all"): string {
  const store = (column: string) => (storeFilter === "one" ? `${column} = ?` : "1");
  return `
    SELECT 'entry' AS kind, e.id AS id, e.store_id AS storeId, e.net_cents - ${RETAINED} AS amountCents,
           o.code AS orderCode, e.method AS method, e.expected_payout_date AS expectedPayoutDate,
           NULL AS reason
    FROM ledger_entries e JOIN orders o ON o.store_id = e.store_id AND o.id = e.order_id
    WHERE e.expected_payout_date <= ? AND ${store("e.store_id")}
      AND NOT EXISTS (SELECT 1 FROM ledger_entry_payouts p WHERE p.ledger_entry_id = e.id)
      AND ${NOT_ANNULLED("e.id")}
    UNION ALL
    SELECT 'retention', r.id, r.store_id, r.amount_cents, o.code, e.method, r.expected_payout_date, NULL
    FROM ledger_retentions r
    JOIN ledger_entries e ON e.id = r.ledger_entry_id
    JOIN orders o ON o.store_id = r.store_id AND o.id = r.order_id
    WHERE r.expected_payout_date <= ? AND ${store("r.store_id")}
      AND ${NOT_IN_BATCH("retention", "r.id")} AND ${NOT_ANNULLED("e.id")}
    UNION ALL
    SELECT 'debit', v.id, v.store_id, -v.net_cents, o.code, e.method, v.expected_payout_date, NULL
    FROM ledger_reversals v
    JOIN ledger_entries e ON e.id = v.ledger_entry_id
    JOIN orders o ON o.store_id = v.store_id AND o.id = v.order_id
    WHERE v.kind = 'compensated_debit' AND v.net_cents > 0 AND v.expected_payout_date <= ?
      AND ${store("v.store_id")}
      AND ${NOT_IN_BATCH("debit", "v.id")}
    UNION ALL
    SELECT 'adjustment', a.id, a.store_id, a.amount_cents, NULL, NULL, NULL, a.reason
    FROM payout_adjustments a
    WHERE ${store("a.store_id")} AND ${NOT_IN_BATCH("adjustment", "a.id")}`;
}

function pendingParams(asOf: string, storeId?: string): unknown[] {
  return storeId === undefined
    ? [asOf, asOf, asOf]
    : [asOf, storeId, asOf, storeId, asOf, storeId, storeId];
}

const ORDER_ITEMS = `ORDER BY storeId, CASE kind WHEN 'entry' THEN 0 WHEN 'retention' THEN 1
  WHEN 'debit' THEN 2 ELSE 3 END, expectedPayoutDate, orderCode, id`;

/** Totais do lote (o mesmo cálculo de `payoutBatchTotals` de @foode/shared/finance). */
function batchTotals(items: readonly PendingPayoutItem[]) {
  let entriesCents = 0;
  let debitsCents = 0;
  let adjustmentsCents = 0;
  for (const item of items) {
    if (item.kind === "entry" || item.kind === "retention") entriesCents += item.amountCents;
    else if (item.kind === "debit") debitsCents -= item.amountCents;
    else adjustmentsCents += item.amountCents;
  }
  return {
    entriesCents,
    debitsCents,
    adjustmentsCents,
    amountCents: entriesCents - debitsCents + adjustmentsCents,
    itemCount: items.length,
  };
}

const BATCH_COLUMNS = `id, store_id AS storeId, payout_date AS payoutDate, paid_on AS paidOn,
  source_account AS sourceAccount, reference, transfer_cost_cents AS transferCostCents,
  entries_cents AS entriesCents, debits_cents AS debitsCents,
  adjustments_cents AS adjustmentsCents, amount_cents AS amountCents, item_count AS itemCount,
  created_by_user_id AS createdByUserId, created_at AS createdAt`;

function isCheckViolation(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : "";
  return /CHECK constraint failed|FOREIGN KEY constraint failed/u.test(message);
}

async function batchesOf(
  d1: D1Database,
  storeId: string,
  from: string,
  to: string,
): Promise<PayoutBatchRowView[]> {
  const { results } = await d1
    .prepare(
      `SELECT ${BATCH_COLUMNS} FROM payout_batches
       WHERE store_id = ? AND paid_on BETWEEN ? AND ?
       ORDER BY paid_on DESC, created_at DESC LIMIT 500`,
    )
    .bind(storeId, from, to)
    .all<PayoutBatchRowView>();
  return results;
}

/** Repasses do Dono: só leitura, só `owner`, só a Loja do contexto. */
export function createStorePayoutOps(d1: D1Database, context: StoreContext) {
  const storeId = context.storeId;
  function requireOwner(): void {
    if (context.role !== "owner") throw new FoodeDbError("forbidden");
  }

  return {
    /**
     * Linhas com repasse previsto em [from, to] (ajustes: criados nos dias civis cujo intervalo
     * UTC é [fromUtc, toUtc)). Sem custo do provedor nem custo do envio.
     */
    async lines(range: {
      from: string;
      to: string;
      fromUtc: string;
      toUtc: string;
    }): Promise<OwnerPayoutLineRow[]> {
      requireOwner();
      const { results } = await d1
        .prepare(
          `SELECT * FROM (
             SELECT e.id AS id, 'payment' AS kind, o.code AS orderCode, e.method AS method,
                    e.card_mode AS cardMode, e.order_total_cents AS orderTotalCents,
                    e.foode_fee_cents AS foodeFeeCents, e.service_fee_cents AS serviceFeeCents,
                    e.net_cents - ${RETAINED} AS netCents,
                    e.expected_payout_date AS expectedPayoutDate,
                    EXISTS (SELECT 1 FROM ledger_entry_payouts p WHERE p.ledger_entry_id = e.id) AS paid,
                    NOT ${NOT_ANNULLED("e.id")} AS annulled,
                    (SELECT i.batch_id FROM payout_batch_items i
                     WHERE i.kind = 'entry' AND i.item_id = e.id) AS batchId,
                    NULL AS reason, e.occurred_at AS occurredAt
             FROM ledger_entries e JOIN orders o ON o.store_id = e.store_id AND o.id = e.order_id
             WHERE e.store_id = ? AND e.expected_payout_date BETWEEN ? AND ?
             UNION ALL
             SELECT r.id, 'retention', o.code, e.method, e.card_mode, 0, 0, 0, r.amount_cents,
                    r.expected_payout_date,
                    NOT ${NOT_IN_BATCH("retention", "r.id")},
                    NOT ${NOT_ANNULLED("e.id")},
                    (SELECT i.batch_id FROM payout_batch_items i
                     WHERE i.kind = 'retention' AND i.item_id = r.id),
                    NULL, r.created_at
             FROM ledger_retentions r
             JOIN ledger_entries e ON e.id = r.ledger_entry_id
             JOIN orders o ON o.store_id = r.store_id AND o.id = r.order_id
             WHERE r.store_id = ? AND r.expected_payout_date BETWEEN ? AND ?
             UNION ALL
             SELECT v.id, 'refund_debit', o.code, e.method, e.card_mode, v.order_total_cents,
                    v.foode_fee_cents, v.service_fee_cents, -v.net_cents, v.expected_payout_date,
                    NOT ${NOT_IN_BATCH("debit", "v.id")}, 0,
                    (SELECT i.batch_id FROM payout_batch_items i
                     WHERE i.kind = 'debit' AND i.item_id = v.id),
                    NULL, v.occurred_at
             FROM ledger_reversals v
             JOIN ledger_entries e ON e.id = v.ledger_entry_id
             JOIN orders o ON o.store_id = v.store_id AND o.id = v.order_id
             WHERE v.store_id = ? AND v.kind = 'compensated_debit'
               AND v.expected_payout_date BETWEEN ? AND ?
             UNION ALL
             SELECT a.id, 'adjustment', NULL, NULL, NULL, 0, 0, 0, a.amount_cents, NULL,
                    NOT ${NOT_IN_BATCH("adjustment", "a.id")}, 0,
                    (SELECT i.batch_id FROM payout_batch_items i
                     WHERE i.kind = 'adjustment' AND i.item_id = a.id),
                    a.reason, a.created_at
             FROM payout_adjustments a
             WHERE a.store_id = ? AND a.created_at >= ? AND a.created_at < ?
           )
           ORDER BY coalesce(expectedPayoutDate, substr(occurredAt, 1, 10)) DESC, occurredAt DESC, id
           LIMIT 2000`,
        )
        .bind(
          storeId,
          range.from,
          range.to,
          storeId,
          range.from,
          range.to,
          storeId,
          range.from,
          range.to,
          storeId,
          range.fromUtc,
          range.toUtc,
        )
        .all<OwnerPayoutLineRow>();
      return results;
    },

    /** Lotes pagos da Loja com o Pix em [from, to]. */
    async batches(from: string, to: string): Promise<PayoutBatchRowView[]> {
      requireOwner();
      return batchesOf(d1, storeId, from, to);
    },
  };
}

export type StorePayoutOps = ReturnType<typeof createStorePayoutOps>;

/** Lotes, ajustes e margem do Ops (`foode_ops`), sempre com auditoria nas escritas. */
export function createOpsPayoutOps(d1: D1Database, context: OpsContext) {
  const actor = context.userId;

  async function pendingItems(asOf: string, storeId?: string): Promise<PendingPayoutItem[]> {
    const { results } = await d1
      .prepare(
        `SELECT * FROM (${pendingItemsSql(storeId === undefined ? "all" : "one")}) ${ORDER_ITEMS}`,
      )
      .bind(...pendingParams(asOf, storeId))
      .all<PendingPayoutItem>();
    return results;
  }

  async function batchByKey(idempotencyKey: string): Promise<PayoutBatchRowView | null> {
    return d1
      .prepare(`SELECT ${BATCH_COLUMNS} FROM payout_batches WHERE idempotency_key = ?`)
      .bind(idempotencyKey)
      .first<PayoutBatchRowView>();
  }

  function replay(batch: PayoutBatchRowView, storeId: string): MarkPayoutPaidOutcome {
    if (batch.storeId !== storeId) throw new FoodeDbError("conflict", "chave de outro lote");
    return {
      batchId: batch.id,
      amountCents: batch.amountCents,
      itemCount: batch.itemCount,
      replayed: true,
    };
  }

  return {
    /** Itens pendentes de todas as Lojas com previsão até `asOf`, e o cadastro de repasse. */
    async payoutsDue(
      asOf: string,
    ): Promise<{ items: PendingPayoutItem[]; stores: PayoutStoreRow[] }> {
      const items = await pendingItems(asOf);
      const ids = [...new Set(items.map((item) => item.storeId))];
      const stores: PayoutStoreRow[] = [];
      for (let index = 0; index < ids.length; index += 90) {
        const chunk = ids.slice(index, index + 90);
        const { results } = await d1
          .prepare(
            `SELECT s.id AS storeId, s.name AS storeName, s.slug AS storeSlug,
                    p.payout_pix_key_type AS pixKeyType, p.payout_pix_key AS pixKey,
                    p.payout_holder_name AS holderName
             FROM stores s LEFT JOIN store_profiles p ON p.store_id = s.id
             WHERE s.id IN (${chunk.map(() => "?").join(", ")})`,
          )
          .bind(...chunk)
          .all<PayoutStoreRow>();
        stores.push(...results);
      }
      return { items, stores };
    },

    /**
     * Marca pago o lote da Loja com os itens pendentes até `asOf`. Idempotente pela chave;
     * `conflict` se o valor mudou desde o resumo confirmado, se não há valor positivo a pagar,
     * se a Loja não tem conta de repasse ou se outro lote/Estorno entrou no meio.
     */
    async markPayoutBatchPaid(data: MarkPayoutPaidData): Promise<MarkPayoutPaidOutcome> {
      const existing = await batchByKey(data.idempotencyKey);
      if (existing) return replay(existing, data.storeId);

      const store = await d1
        .prepare(
          `SELECT s.id AS id, p.store_id AS profile FROM stores s
           LEFT JOIN store_profiles p ON p.store_id = s.id WHERE s.id = ?`,
        )
        .bind(data.storeId)
        .first<{ id: string; profile: string | null }>();
      if (!store) throw new FoodeDbError("not_found");
      if (!store.profile) throw new FoodeDbError("conflict", "Loja sem conta de repasse");

      const items = await pendingItems(data.asOf, data.storeId);
      const totals = batchTotals(items);
      if (totals.itemCount === 0 || totals.amountCents <= 0) {
        throw new FoodeDbError("conflict", "nada a repassar");
      }
      if (totals.amountCents !== data.expectedAmountCents) {
        throw new FoodeDbError("conflict", "valor do lote mudou");
      }

      const batchId = newId();
      const now = utcNow();
      const payload = JSON.stringify(
        items.map((item) => ({
          id: newId(),
          kind: item.kind,
          itemId: item.id,
          amount: item.amountCents,
        })),
      );
      const metadata = JSON.stringify({
        before: null,
        after: {
          batchId,
          payoutDate: data.asOf,
          paidOn: data.paidOn,
          sourceAccount: data.sourceAccount,
          reference: data.reference,
          transferCostCents: data.transferCostCents,
          ...totals,
        },
      });
      try {
        await d1.batch([
          d1
            .prepare(
              `INSERT INTO payout_batches (id, store_id, payout_date, paid_on, source_account,
                 reference, transfer_cost_cents, entries_cents, debits_cents, adjustments_cents,
                 amount_cents, item_count, idempotency_key, created_by_user_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              batchId,
              data.storeId,
              data.asOf,
              data.paidOn,
              data.sourceAccount,
              data.reference,
              data.transferCostCents,
              totals.entriesCents,
              totals.debitsCents,
              totals.adjustmentsCents,
              totals.amountCents,
              totals.itemCount,
              data.idempotencyKey,
              actor,
              now,
            ),
          d1
            .prepare(
              `INSERT INTO payout_batch_items (id, batch_id, store_id, kind, item_id, amount_cents, created_at)
               SELECT json_extract(value, '$.id'), ?, ?, json_extract(value, '$.kind'),
                      json_extract(value, '$.itemId'), json_extract(value, '$.amount'), ?
               FROM json_each(?)`,
            )
            .bind(batchId, data.storeId, now, payload),
          d1
            .prepare(
              `INSERT INTO ledger_entry_payouts (ledger_entry_id, store_id, paid_out_at, created_at)
               SELECT item_id, store_id, ?, ? FROM payout_batch_items
               WHERE batch_id = ? AND kind = 'entry'`,
            )
            .bind(now, now, batchId),
          // Guarda: lançamento/retenção anulado entre a leitura e a escrita, ou item que não é da
          // Loja, quebra o CHECK (item_count ≥ 1) e desfaz o batch inteiro.
          d1
            .prepare(
              `UPDATE payout_batches SET item_count = 0
               WHERE id = ? AND (
                 (SELECT count(*) FROM payout_batch_items WHERE batch_id = ?) <> ?
                 OR EXISTS (
                   SELECT 1 FROM payout_batch_items i
                   JOIN ledger_reversals v ON v.kind = 'annulment' AND v.ledger_entry_id =
                     CASE i.kind WHEN 'entry' THEN i.item_id
                       ELSE (SELECT r.ledger_entry_id FROM ledger_retentions r WHERE r.id = i.item_id) END
                   WHERE i.batch_id = ? AND i.kind IN ('entry', 'retention'))
                 OR EXISTS (
                   SELECT 1 FROM payout_batch_items i WHERE i.batch_id = ? AND (
                     (i.kind = 'entry' AND NOT EXISTS (SELECT 1 FROM ledger_entries x
                        WHERE x.id = i.item_id AND x.store_id = i.store_id))
                     OR (i.kind = 'retention' AND NOT EXISTS (SELECT 1 FROM ledger_retentions x
                        WHERE x.id = i.item_id AND x.store_id = i.store_id))
                     OR (i.kind = 'debit' AND NOT EXISTS (SELECT 1 FROM ledger_reversals x
                        WHERE x.id = i.item_id AND x.store_id = i.store_id
                          AND x.kind = 'compensated_debit'))
                     OR (i.kind = 'adjustment' AND NOT EXISTS (SELECT 1 FROM payout_adjustments x
                        WHERE x.id = i.item_id AND x.store_id = i.store_id)))))`,
            )
            .bind(batchId, batchId, totals.itemCount, batchId, batchId),
          d1
            .prepare(
              `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
               VALUES (?, ?, ?, ?, 'payout.batch_paid', 'payout_batch', ?, ?)`,
            )
            .bind(newId(), now, actor, data.storeId, batchId, metadata),
        ]);
      } catch (error) {
        if (isUniqueViolation(error)) {
          const raced = await batchByKey(data.idempotencyKey);
          if (raced) return replay(raced, data.storeId);
          throw new FoodeDbError("conflict", "item já repassado");
        }
        if (isCheckViolation(error)) throw new FoodeDbError("conflict", "lote mudou");
        throw error;
      }
      return {
        batchId,
        amountCents: totals.amountCents,
        itemCount: totals.itemCount,
        replayed: false,
      };
    },

    /** Ajuste auditado; Loja inexistente ou lote de outra Loja = `not_found`. */
    async createPayoutAdjustment(data: PayoutAdjustmentData): Promise<{ adjustmentId: string }> {
      const adjustmentId = newId();
      const now = utcNow();
      const metadata = JSON.stringify({
        before: null,
        after: {
          adjustmentId,
          amountCents: data.amountCents,
          reason: data.reason,
          relatedBatchId: data.batchId,
        },
      });
      try {
        const [insert] = await d1.batch([
          d1
            .prepare(
              `INSERT INTO payout_adjustments (id, store_id, amount_cents, reason, related_batch_id,
                 created_by_user_id, created_at)
               SELECT ?, s.id, ?, ?, ?, ?, ? FROM stores s
               WHERE s.id = ? AND (? IS NULL OR EXISTS (
                 SELECT 1 FROM payout_batches b WHERE b.id = ? AND b.store_id = s.id))`,
            )
            .bind(
              adjustmentId,
              data.amountCents,
              data.reason,
              data.batchId,
              actor,
              now,
              data.storeId,
              data.batchId,
              data.batchId,
            ),
          d1
            .prepare(
              `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
               SELECT ?, ?, ?, store_id, 'payout.adjustment_created', 'payout_adjustment', id, ?
               FROM payout_adjustments WHERE id = ?`,
            )
            .bind(newId(), now, actor, metadata, adjustmentId),
        ]);
        if ((insert?.meta.changes ?? 0) === 0) throw new FoodeDbError("not_found");
      } catch (error) {
        if (isCheckViolation(error)) throw new FoodeDbError("invalid_input");
        throw error;
      }
      return { adjustmentId };
    },

    /** Lotes de uma Loja com o Pix em [from, to] (inclui custo do envio). */
    payoutBatches(storeId: string, from: string, to: string): Promise<PayoutBatchRowView[]> {
      return batchesOf(d1, storeId, from, to);
    },

    /**
     * Agregados da margem por Loja: pagamentos e Estornos com `occurred_at` em [fromUtc, toUtc) e
     * lotes com o Pix nos dias civis [from, to]. Lojas sem nenhum fato no período ficam fora.
     */
    async marginByStore(range: {
      from: string;
      to: string;
      fromUtc: string;
      toUtc: string;
    }): Promise<MarginStoreRow[]> {
      const { results } = await d1
        .prepare(
          `WITH pay AS (
             SELECT store_id, count(*) AS payments, sum(foode_fee_cents) AS fee,
                    sum(service_fee_cents) AS svc, sum(coalesce(provider_cost_cents, 0)) AS cost,
                    sum(provider_cost_cents IS NULL) AS unknown
             FROM ledger_entries WHERE occurred_at >= ? AND occurred_at < ? GROUP BY store_id),
           rev AS (
             SELECT store_id, sum(foode_fee_cents) AS fee, sum(service_fee_cents) AS svc
             FROM ledger_reversals WHERE occurred_at >= ? AND occurred_at < ? GROUP BY store_id),
           bat AS (
             SELECT store_id, count(*) AS batches, sum(transfer_cost_cents) AS cost
             FROM payout_batches WHERE paid_on BETWEEN ? AND ? GROUP BY store_id),
           ids AS (SELECT store_id FROM pay UNION SELECT store_id FROM rev UNION SELECT store_id FROM bat)
           SELECT s.id AS storeId, s.name AS storeName,
                  coalesce(pay.payments, 0) AS payments, coalesce(pay.fee, 0) AS foodeFeeCents,
                  coalesce(rev.fee, 0) AS refundedFoodeFeeCents,
                  coalesce(pay.svc, 0) AS serviceFeeCents,
                  coalesce(rev.svc, 0) AS refundedServiceFeeCents,
                  coalesce(pay.cost, 0) AS providerCostCents,
                  coalesce(pay.unknown, 0) AS providerCostUnknown,
                  coalesce(bat.cost, 0) AS transferCostCents, coalesce(bat.batches, 0) AS batches
           FROM ids JOIN stores s ON s.id = ids.store_id
           LEFT JOIN pay ON pay.store_id = s.id
           LEFT JOIN rev ON rev.store_id = s.id
           LEFT JOIN bat ON bat.store_id = s.id
           ORDER BY s.name, s.id`,
        )
        .bind(range.fromUtc, range.toUtc, range.fromUtc, range.toUtc, range.from, range.to)
        .all<MarginStoreRow>();
      return results;
    },
  };
}

export type OpsPayoutOps = ReturnType<typeof createOpsPayoutOps>;
