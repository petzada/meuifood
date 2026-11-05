// Reconciliação por Cron Trigger no D1 (Ticket 15, migration 0011). Sem StoreContext: quem chama
// é o handler `scheduled` da api; a Loja sai sempre da intenção/lançamento gravados.
//
// - Trava leve por rotina (`maintenance_locks`): UPSERT condicional — só uma execução por vez;
//   trava vencida (Worker morto no meio) libera sozinha. Guarda o resumo da última execução.
// - Candidatos da reconciliação: PIX aberto sem consulta recente (webhook perdido), PIX vencido
//   que ainda pode ter sido pago (pagamento tardio) e lançamentos do Cartão com liberação ainda
//   pelo prazo máximo.
// - Liberação confirmada: grava o fato (`ledger_release_confirmations`) e move só a data de
//   repasse PREVISTA do lançamento — nunca marca repasse efetivo (`ledger_entry_payouts`). Já
//   repassado ou estornado = nada muda (o dinheiro não é corrigido automaticamente).
// - Divergências da obrigação de repasse: só CONTAGENS para o alerta; nada é corrigido aqui.
// Nada aqui registra log nem guarda dado do pagador.
import { utcNow } from "./conventions";
import type { MaintenanceLockName, PaymentIntentState } from "./schema";

function changed(result: D1Result | undefined): boolean {
  return (result?.meta.changes ?? 0) > 0;
}

/** PIX a conferir no provedor (aberto ou vencido). */
export type PixReconcileCandidate = {
  intentId: string;
  storeId: string;
  orderId: string;
  state: PaymentIntentState;
  providerChargeId: string;
  expiresAt: string | null;
};

/** Lançamento do Cartão com liberação ainda pelo prazo máximo do modo. */
export type ReleaseCandidate = {
  ledgerEntryId: string;
  intentId: string;
  storeId: string;
  provider: "efi" | "abacatepay";
  providerChargeId: string;
  releaseDate: string;
  expectedPayoutDate: string;
};

/** Contagens de divergência da obrigação de repasse (alerta; nada é corrigido). */
export type PayoutDivergences = {
  /** Intenção paga sem lançamento no Ledger. */
  paidWithoutLedger: number;
  /** Lançamento cujo valor/tarifa/Loja/Pedido não batem com a intenção paga. */
  ledgerMismatch: number;
  /** Pedido cancelado com cobrança paga e sem obrigação de Estorno. */
  cancelledPaidWithoutRefund: number;
  /** Estorno de cobrança lançada sem reversão no Ledger (repasse ainda contaria o valor). */
  refundWithoutReversal: number;
  /** Repasse previsto vencido sem liberação confirmada no provedor (Cartão). */
  payoutDueUnreleased: number;
  /** Retenções somando mais que o líquido do lançamento. */
  retentionsOverNet: number;
  /** Repasse marcado em lançamento de outra Loja. */
  payoutStoreMismatch: number;
};

const PIX_SELECT = `SELECT i.id AS intentId, i.store_id AS storeId, i.order_id AS orderId,
  i.state AS state, i.provider_charge_id AS providerChargeId, i.expires_at AS expiresAt
  FROM payment_intents i`;

const ENTRY_OPEN = (e: string) => `NOT EXISTS (SELECT 1 FROM ledger_entry_payouts p
    WHERE p.ledger_entry_id = ${e}.id)
  AND NOT EXISTS (SELECT 1 FROM ledger_reversals v WHERE v.ledger_entry_id = ${e}.id)`;

const UNCONFIRMED = (e: string) => `NOT EXISTS (SELECT 1 FROM ledger_release_confirmations r
    WHERE r.ledger_entry_id = ${e}.id)`;

export function createReconciliationOps(d1: D1Database) {
  return {
    /**
     * Tenta a trava da rotina: grava `holder` se a trava está livre ou vencida (`now`). Devolve
     * true só para quem ficou com ela (duas execuções sobrepostas = uma roda).
     */
    async acquireLock(
      name: MaintenanceLockName,
      holder: string,
      now: string,
      lockedUntil: string,
    ): Promise<boolean> {
      const [, current] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO maintenance_locks (name, holder, locked_until, acquired_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(name) DO UPDATE SET holder = excluded.holder,
               locked_until = excluded.locked_until, acquired_at = excluded.acquired_at,
               updated_at = excluded.updated_at
             WHERE maintenance_locks.locked_until IS NULL
               OR maintenance_locks.locked_until <= excluded.acquired_at`,
          )
          .bind(name, holder, lockedUntil, now, now),
        d1.prepare(`SELECT holder FROM maintenance_locks WHERE name = ?`).bind(name),
      ]);
      const row = (current?.results as { holder: string | null }[] | undefined)?.[0];
      return row?.holder === holder;
    },

    /** Solta a trava (só quem a segura) e guarda o resumo da execução. */
    async releaseLock(
      name: MaintenanceLockName,
      holder: string,
      finishedAt: string,
      summary: string,
    ): Promise<boolean> {
      const result = await d1
        .prepare(
          `UPDATE maintenance_locks SET holder = NULL, locked_until = NULL, last_finished_at = ?,
             last_summary = ?, updated_at = ?
           WHERE name = ? AND holder = ?`,
        )
        .bind(finishedAt, summary.slice(0, 4000), finishedAt, name, holder)
        .run();
      return changed(result);
    },

    /** Estado da trava (conferência e testes). */
    lockOf(name: MaintenanceLockName) {
      return d1
        .prepare(
          `SELECT holder, locked_until AS lockedUntil, last_finished_at AS lastFinishedAt,
             last_summary AS lastSummary FROM maintenance_locks WHERE name = ?`,
        )
        .bind(name)
        .first<{
          holder: string | null;
          lockedUntil: string | null;
          lastFinishedAt: string | null;
          lastSummary: string | null;
        }>();
    },

    /**
     * PIX aberto (QR ainda válido) sem consulta desde `checkedBefore`: o webhook pode ter se
     * perdido. QR vencido fica com a varredura de vencimento (`refunds.expirablePix`).
     */
    async pixPendingDueForCheck(
      now: string,
      checkedBefore: string,
      limit: number,
    ): Promise<PixReconcileCandidate[]> {
      const { results } = await d1
        .prepare(
          `${PIX_SELECT}
           WHERE i.method = 'pix' AND i.state = 'pending' AND i.provider_charge_id IS NOT NULL
             AND (i.expires_at IS NULL OR i.expires_at > ?)
             AND COALESCE(i.checked_at, i.created_at) <= ?
           ORDER BY COALESCE(i.checked_at, i.created_at) LIMIT ?`,
        )
        .bind(now, checkedBefore, limit)
        .all<PixReconcileCandidate>();
      return results;
    },

    /**
     * PIX vencido (Pedido normalmente já cancelado) que ainda pode aparecer pago no provedor:
     * venceu depois de `expiredSince` e não foi conferido desde `checkedBefore`.
     */
    async latePixDueForCheck(
      expiredSince: string,
      checkedBefore: string,
      limit: number,
    ): Promise<PixReconcileCandidate[]> {
      const { results } = await d1
        .prepare(
          `${PIX_SELECT}
           WHERE i.method = 'pix' AND i.state = 'expired' AND i.provider_charge_id IS NOT NULL
             AND i.expires_at IS NOT NULL AND i.expires_at >= ?
             AND COALESCE(i.checked_at, i.expires_at) <= ?
           ORDER BY COALESCE(i.checked_at, i.expires_at) LIMIT ?`,
        )
        .bind(expiredSince, checkedBefore, limit)
        .all<PixReconcileCandidate>();
      return results;
    },

    /**
     * Lançamentos do Cartão ainda pelo prazo máximo (sem liberação confirmada), não repassados
     * nem estornados, sem consulta desde `checkedBefore`. Repasse mais próximo primeiro.
     */
    async releasesDueForCheck(checkedBefore: string, limit: number): Promise<ReleaseCandidate[]> {
      const { results } = await d1
        .prepare(
          `SELECT e.id AS ledgerEntryId, e.intent_id AS intentId, e.store_id AS storeId,
             i.provider AS provider, i.provider_charge_id AS providerChargeId,
             e.release_date AS releaseDate, e.expected_payout_date AS expectedPayoutDate
           FROM ledger_entries e
           JOIN payment_intents i ON i.id = e.intent_id AND i.store_id = e.store_id
           JOIN card_payments c ON c.intent_id = i.id
           WHERE e.kind = 'payment' AND e.method = 'credit' AND i.state = 'paid'
             AND i.provider_charge_id IS NOT NULL AND c.release_source = 'max_term'
             AND ${UNCONFIRMED("e")} AND ${ENTRY_OPEN("e")}
             AND COALESCE(i.checked_at, i.paid_at) <= ?
           ORDER BY e.expected_payout_date, e.rowid LIMIT ?`,
        )
        .bind(checkedBefore, limit)
        .all<ReleaseCandidate>();
      return results;
    },

    /**
     * Liberação confirmada no provedor, num único batch: o fato (uma vez por lançamento, com as
     * datas anteriores), a nova liberação/repasse PREVISTOS do lançamento e a liberação do Cartão
     * (`informed`). Lançamento já repassado ou estornado = nada muda. Repetir = nada muda.
     */
    async confirmRelease(input: {
      ledgerEntryId: string;
      providerStatus: string;
      releaseDate: string;
      expectedPayoutDate: string;
      confirmedAt: string;
    }): Promise<boolean> {
      const now = utcNow();
      const status = input.providerStatus.trim().slice(0, 40) || "confirmed";
      const confirmedHere = `EXISTS (SELECT 1 FROM ledger_release_confirmations r
        WHERE r.ledger_entry_id = ? AND r.confirmed_at = ? AND r.created_at = ?)`;
      const [inserted] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO ledger_release_confirmations (ledger_entry_id, store_id, order_id,
               provider, provider_status, release_date, expected_payout_date,
               previous_release_date, previous_expected_payout_date, confirmed_at, created_at)
             SELECT e.id, e.store_id, e.order_id, e.provider, ?, ?, ?, e.release_date,
               e.expected_payout_date, ?, ?
             FROM ledger_entries e
             WHERE e.id = ? AND e.kind = 'payment' AND e.method = 'credit' AND ${ENTRY_OPEN("e")}
             ON CONFLICT DO NOTHING`,
          )
          .bind(
            status,
            input.releaseDate,
            input.expectedPayoutDate,
            input.confirmedAt,
            now,
            input.ledgerEntryId,
          ),
        d1
          .prepare(
            `UPDATE ledger_entries AS e SET release_date = ?, expected_payout_date = ?
             WHERE e.id = ? AND ${ENTRY_OPEN("e")} AND ${confirmedHere}`,
          )
          .bind(
            input.releaseDate,
            input.expectedPayoutDate,
            input.ledgerEntryId,
            input.ledgerEntryId,
            input.confirmedAt,
            now,
          ),
        d1
          .prepare(
            `UPDATE card_payments SET expected_release_date = ?, release_source = 'informed',
               updated_at = ?
             WHERE intent_id = (SELECT intent_id FROM ledger_entries WHERE id = ?)
               AND ${confirmedHere}`,
          )
          .bind(
            input.releaseDate,
            now,
            input.ledgerEntryId,
            input.ledgerEntryId,
            input.confirmedAt,
            now,
          ),
      ]);
      return changed(inserted);
    },

    /** Liberação confirmada do lançamento da intenção (conferência e testes). */
    releaseConfirmationOfIntent(intentId: string) {
      return d1
        .prepare(
          `SELECT r.provider_status AS providerStatus, r.release_date AS releaseDate,
             r.expected_payout_date AS expectedPayoutDate,
             r.previous_release_date AS previousReleaseDate,
             r.previous_expected_payout_date AS previousExpectedPayoutDate
           FROM ledger_release_confirmations r
           JOIN ledger_entries e ON e.id = r.ledger_entry_id WHERE e.intent_id = ?`,
        )
        .bind(intentId)
        .first<{
          providerStatus: string;
          releaseDate: string;
          expectedPayoutDate: string;
          previousReleaseDate: string;
          previousExpectedPayoutDate: string;
        }>();
    },

    /**
     * Divergências da obrigação de repasse (`today` = data civil de São Paulo). Só contagens:
     * quem chama alerta; nada é corrigido automaticamente.
     */
    async payoutDivergences(today: string): Promise<PayoutDivergences> {
      const row = await d1
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM payment_intents i WHERE i.state = 'paid'
               AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.intent_id = i.id
                 AND e.kind = 'payment')) AS paidWithoutLedger,
             (SELECT COUNT(*) FROM ledger_entries e JOIN payment_intents i ON i.id = e.intent_id
               WHERE e.charged_cents <> i.amount_cents
                 OR e.service_fee_cents <> i.service_fee_cents
                 OR e.store_id <> i.store_id OR e.order_id <> i.order_id
                 OR i.state <> 'paid') AS ledgerMismatch,
             (SELECT COUNT(*) FROM payment_intents i
               JOIN orders o ON o.store_id = i.store_id AND o.id = i.order_id
               WHERE o.status = 'cancelled' AND i.state = 'paid'
                 AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.intent_id = i.id))
               AS cancelledPaidWithoutRefund,
             (SELECT COUNT(*) FROM refunds r
               JOIN ledger_entries e ON e.intent_id = r.intent_id AND e.kind = 'payment'
               WHERE NOT EXISTS (SELECT 1 FROM ledger_reversals v
                 WHERE v.ledger_entry_id = e.id)) AS refundWithoutReversal,
             (SELECT COUNT(*) FROM ledger_entries e
               JOIN card_payments c ON c.intent_id = e.intent_id
               WHERE e.method = 'credit' AND c.release_source = 'max_term'
                 AND e.expected_payout_date <= ? AND ${UNCONFIRMED("e")} AND ${ENTRY_OPEN("e")})
               AS payoutDueUnreleased,
             (SELECT COUNT(*) FROM ledger_entries e
               WHERE (SELECT COALESCE(SUM(t.amount_cents), 0) FROM ledger_retentions t
                 WHERE t.ledger_entry_id = e.id) > e.net_cents) AS retentionsOverNet,
             (SELECT COUNT(*) FROM ledger_entry_payouts p
               JOIN ledger_entries e ON e.id = p.ledger_entry_id
               WHERE p.store_id <> e.store_id) AS payoutStoreMismatch`,
        )
        .bind(today)
        .first<PayoutDivergences>();
      return {
        paidWithoutLedger: row?.paidWithoutLedger ?? 0,
        ledgerMismatch: row?.ledgerMismatch ?? 0,
        cancelledPaidWithoutRefund: row?.cancelledPaidWithoutRefund ?? 0,
        refundWithoutReversal: row?.refundWithoutReversal ?? 0,
        payoutDueUnreleased: row?.payoutDueUnreleased ?? 0,
        retentionsOverNet: row?.retentionsOverNet ?? 0,
        payoutStoreMismatch: row?.payoutStoreMismatch ?? 0,
      };
    },
  };
}

export type ReconciliationOps = ReturnType<typeof createReconciliationOps>;
