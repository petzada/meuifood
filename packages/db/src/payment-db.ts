// Pagamento online no D1 (Ticket 26): intenção PIX, eventos de webhook e Ledger. Sem
// StoreContext: quem chama é o próprio sistema (criação do Pedido pelo Slug, página do Pedido pelo
// token já conferido, webhook autenticado do provedor); a Loja sai sempre da intenção gravada,
// nunca do request. Toda transição é um UPDATE condicional no estado anterior (sem regressão) e a
// confirmação do pagamento é UM `batch` (transação do D1): evento + intenção + Pedido + Ledger.
// Nada aqui registra log nem guarda corpo de webhook ou dado do pagador.
import { newId, utcNow } from "./conventions";
import { lateRefundStatements } from "./refund-db";
import type { PaymentIntentState, WebhookEventOutcome } from "./schema";

export type PaymentProviderName = "abacatepay" | "efi";

export type PixIntentView = {
  intentId: string;
  storeId: string;
  orderId: string;
  state: PaymentIntentState;
  amountCents: number;
  serviceFeeCents: number;
  providerChargeId: string | null;
  copyPaste: string | null;
  qrCode: string | null;
  expiresAt: string | null;
  attemptStartedAt: string | null;
  checkedAt: string | null;
  paidAt: string | null;
  providerFeeCents: number | null;
  foodeFee: { feeId: string; percentBps: number; fixedCents: number };
  createdAt: string;
  /** Status do Pedido (a página e o webhook não reabrem Pedido cancelado). */
  orderStatus: string;
};

type IntentRow = Omit<PixIntentView, "foodeFee"> & {
  foodeFeeId: string;
  foodeFeePercentBps: number;
  foodeFeeFixedCents: number;
};

const INTENT_SELECT = `SELECT i.id AS intentId, i.store_id AS storeId, i.order_id AS orderId,
  i.state AS state, i.amount_cents AS amountCents, i.service_fee_cents AS serviceFeeCents,
  i.provider_charge_id AS providerChargeId, i.pix_copy_paste AS copyPaste, i.pix_qr_code AS qrCode,
  i.expires_at AS expiresAt, i.attempt_started_at AS attemptStartedAt, i.checked_at AS checkedAt,
  i.paid_at AS paidAt, i.provider_fee_cents AS providerFeeCents, i.foode_fee_id AS foodeFeeId,
  i.foode_fee_percent_bps AS foodeFeePercentBps, i.foode_fee_fixed_cents AS foodeFeeFixedCents,
  i.created_at AS createdAt, o.status AS orderStatus
  FROM payment_intents i JOIN orders o ON o.store_id = i.store_id AND o.id = i.order_id`;

function toView(row: IntentRow | null): PixIntentView | null {
  if (!row) return null;
  const { foodeFeeId, foodeFeePercentBps, foodeFeeFixedCents, ...rest } = row;
  return {
    ...rest,
    foodeFee: { feeId: foodeFeeId, percentBps: foodeFeePercentBps, fixedCents: foodeFeeFixedCents },
  };
}

function changed(result: D1Result | undefined): boolean {
  return (result?.meta.changes ?? 0) > 0;
}

export type RecordPixChargeInput = {
  intentId: string;
  providerChargeId: string;
  copyPaste: string;
  qrCode: string | null;
  expiresAt: string;
  providerFeeCents: number | null;
  devMode: boolean;
};

/** Lançamento calculado pela api (regras puras de @foode/shared/payment). */
export type LedgerSnapshotInput = {
  chargedCents: number;
  orderTotalCents: number;
  serviceFeeCents: number;
  foodeFeeCents: number;
  providerCostCents: number | null;
  netCents: number;
  releaseDate: string;
  expectedPayoutDate: string;
};

export type WebhookEventInput = {
  provider: PaymentProviderName;
  eventId: string;
  eventType: string;
  devMode: boolean;
};

export type ConfirmPaymentInput = {
  intentId: string;
  providerChargeId: string;
  /** Valor confirmado pelo provedor (tem de ser igual ao da intenção). */
  amountCents: number;
  paidAt: string;
  providerFeeCents: number | null;
  ledger: LedgerSnapshotInput;
  /** Evento do webhook que confirmou (null = consulta autenticada). */
  event: WebhookEventInput | null;
};

export type ConfirmPaymentResult = "applied" | "already_applied" | "rejected";

export function createPaymentOps(d1: D1Database) {
  async function intentWhere(where: string, ...binds: unknown[]): Promise<PixIntentView | null> {
    const row = await d1
      .prepare(`${INTENT_SELECT} WHERE ${where}`)
      .bind(...binds)
      .first<IntentRow>();
    return toView(row);
  }

  return {
    /** Intenção PIX do Pedido (o id do Pedido já veio de um token conferido). */
    pixIntentOfOrder(orderId: string): Promise<PixIntentView | null> {
      return intentWhere(`i.order_id = ? AND i.method = 'pix'`, orderId);
    },

    intentById(intentId: string): Promise<PixIntentView | null> {
      return intentWhere(`i.id = ?`, intentId);
    },

    intentByProviderCharge(
      provider: PaymentProviderName,
      chargeId: string,
    ): Promise<PixIntentView | null> {
      return intentWhere(`i.provider = ? AND i.provider_charge_id = ?`, provider, chargeId);
    },

    /**
     * Reserva a criação da cobrança (lease): só uma chamada por vez chega ao provedor, e só
     * enquanto não há cobrança gravada. Uma tentativa sem resposta (timeout) libera de novo
     * depois de `staleBefore`: a cobrança órfã nunca foi mostrada a ninguém, então não pode ser
     * paga.
     */
    async claimChargeAttempt(intentId: string, now: string, staleBefore: string): Promise<boolean> {
      const result = await d1
        .prepare(
          `UPDATE payment_intents SET attempt_started_at = ?, updated_at = ?
           WHERE id = ? AND state = 'creating' AND provider_charge_id IS NULL
             AND (attempt_started_at IS NULL OR attempt_started_at < ?)`,
        )
        .bind(now, now, intentId, staleBefore)
        .run();
      return changed(result);
    },

    /** Grava a cobrança criada (creating → pending). Não sobrescreve cobrança já gravada. */
    async recordPixCharge(input: RecordPixChargeInput): Promise<boolean> {
      const now = utcNow();
      const result = await d1
        .prepare(
          `UPDATE payment_intents SET state = 'pending', provider_charge_id = ?, pix_copy_paste = ?,
             pix_qr_code = ?, expires_at = ?, provider_fee_cents = ?, dev_mode = ?, updated_at = ?
           WHERE id = ? AND state = 'creating' AND provider_charge_id IS NULL`,
        )
        .bind(
          input.providerChargeId,
          input.copyPaste,
          input.qrCode,
          input.expiresAt,
          input.providerFeeCents,
          input.devMode ? 1 : 0,
          now,
          input.intentId,
        )
        .run();
      return changed(result);
    },

    /** O provedor recusou criar a cobrança (erro definitivo): intenção e Pedido `failed`. */
    async failChargeAttempt(intentId: string, failureCode: string): Promise<void> {
      const now = utcNow();
      await d1.batch([
        d1
          .prepare(
            `UPDATE payment_intents SET state = 'failed', failure_code = ?, updated_at = ?
             WHERE id = ? AND state = 'creating' AND provider_charge_id IS NULL`,
          )
          .bind(failureCode.slice(0, 80), now, intentId),
        d1
          .prepare(
            `UPDATE orders SET payment_status = 'failed', updated_at = ?
             WHERE payment_status = 'awaiting' AND (store_id, id) IN (
               SELECT store_id, order_id FROM payment_intents WHERE id = ? AND state = 'failed')`,
          )
          .bind(now, intentId),
      ]);
    },

    /** Última consulta autenticada ao provedor (limita a reconciliação por polling). */
    async markChecked(intentId: string, now: string): Promise<void> {
      await d1
        .prepare(`UPDATE payment_intents SET checked_at = ? WHERE id = ?`)
        .bind(now, intentId)
        .run();
    },

    /** PIX venceu sem pagamento (conferido no provedor): pending → expired, Pedido `expired`. */
    async expirePix(intentId: string): Promise<boolean> {
      const now = utcNow();
      const [intent] = await d1.batch([
        d1
          .prepare(
            `UPDATE payment_intents SET state = 'expired', updated_at = ?
             WHERE id = ? AND state IN ('creating', 'pending')`,
          )
          .bind(now, intentId),
        d1
          .prepare(
            `UPDATE orders SET payment_status = 'expired', updated_at = ?
             WHERE payment_status = 'awaiting' AND (store_id, id) IN (
               SELECT store_id, order_id FROM payment_intents WHERE id = ? AND state = 'expired')`,
          )
          .bind(now, intentId),
      ]);
      return changed(intent);
    },

    /** Evento já registrado (reentrega/duplicata): a api responde 2xx sem reprocessar. */
    async webhookEventSeen(provider: PaymentProviderName, eventId: string): Promise<boolean> {
      const row = await d1
        .prepare(`SELECT 1 AS seen FROM payment_webhook_events WHERE provider = ? AND event_id = ?`)
        .bind(provider, eventId)
        .first<{ seen: number }>();
      return row?.seen === 1;
    },

    /** Registra um evento que não muda dinheiro (ignorado, sem intenção, valor divergente…). */
    async recordWebhookEvent(
      event: WebhookEventInput & {
        providerChargeId: string | null;
        intentId: string | null;
        outcome: WebhookEventOutcome;
      },
    ): Promise<void> {
      await d1
        .prepare(
          `INSERT INTO payment_webhook_events (id, provider, event_id, event_type,
             provider_charge_id, intent_id, outcome, dev_mode, received_at)
           SELECT ?, ?, ?, ?, ?, (SELECT id FROM payment_intents WHERE id = ?), ?, ?, ?
           ON CONFLICT(provider, event_id) DO NOTHING`,
        )
        .bind(
          newId(),
          event.provider,
          event.eventId,
          event.eventType,
          event.providerChargeId,
          event.intentId,
          event.outcome,
          event.devMode ? 1 : 0,
          utcNow(),
        )
        .run();
    },

    /**
     * Confirma o pagamento num único `batch`: evento (identidade única) → intenção `paid` (de
     * creating/pending/expired/failed, nunca de volta) → Pedido `paid` (entra na fila do Painel)
     * → lançamento único no Ledger → (Pedido já cancelado) obrigação de Estorno total + reversão
     * (Ticket 12). Evento repetido ou intenção já paga = nada muda.
     */
    async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
      const now = utcNow();
      const eventRowId = newId();
      const ledgerId = newId();
      const eventGuard = input.event
        ? `AND EXISTS (SELECT 1 FROM payment_webhook_events WHERE id = '${eventRowId}')`
        : "";
      const statements: D1PreparedStatement[] = [];
      if (input.event) {
        statements.push(
          d1
            .prepare(
              `INSERT INTO payment_webhook_events (id, provider, event_id, event_type,
                 provider_charge_id, intent_id, outcome, dev_mode, received_at)
               SELECT ?, ?, ?, ?, ?, ?,
                 CASE WHEN EXISTS (SELECT 1 FROM payment_intents WHERE id = ? AND state = 'paid')
                   THEN 'already_applied' ELSE 'applied' END,
                 ?, ?
               WHERE 1
               ON CONFLICT(provider, event_id) DO NOTHING`,
            )
            .bind(
              eventRowId,
              input.event.provider,
              input.event.eventId,
              input.event.eventType,
              input.providerChargeId,
              input.intentId,
              input.intentId,
              input.event.devMode ? 1 : 0,
              now,
            ),
        );
      }
      statements.push(
        d1
          .prepare(
            `UPDATE payment_intents SET state = 'paid', paid_at = ?,
               provider_charge_id = COALESCE(provider_charge_id, ?),
               provider_fee_cents = COALESCE(?, provider_fee_cents), updated_at = ?
             WHERE id = ? AND state IN ('creating', 'pending', 'expired', 'failed')
               AND amount_cents = ?
               AND (provider_charge_id IS NULL OR provider_charge_id = ?) ${eventGuard}`,
          )
          .bind(
            input.paidAt,
            input.providerChargeId,
            input.providerFeeCents,
            now,
            input.intentId,
            input.amountCents,
            input.providerChargeId,
          ),
        d1
          .prepare(
            `UPDATE orders SET payment_status = 'paid', updated_at = ?
             WHERE payment_status <> 'paid' AND (store_id, id) IN (
               SELECT store_id, order_id FROM payment_intents
               WHERE id = ? AND state = 'paid' AND paid_at = ?)`,
          )
          .bind(now, input.intentId, input.paidAt),
        d1
          .prepare(
            `INSERT INTO ledger_entries (id, store_id, order_id, intent_id, kind, provider, method,
               card_mode, custody, charged_cents, order_total_cents, service_fee_cents,
               foode_fee_cents, foode_fee_id, provider_cost_cents, net_cents, release_date,
               expected_payout_date, occurred_at, created_at)
             SELECT ?, store_id, order_id, id, 'payment', provider, method, card_mode, custody,
               ?, ?, service_fee_cents, ?, foode_fee_id, ?, ?, ?, ?, paid_at, ?
             FROM payment_intents
             WHERE id = ? AND state = 'paid' AND paid_at = ? AND amount_cents = ?
               AND service_fee_cents = ?
             ON CONFLICT(intent_id) WHERE kind = 'payment' DO NOTHING`,
          )
          .bind(
            ledgerId,
            input.ledger.chargedCents,
            input.ledger.orderTotalCents,
            input.ledger.foodeFeeCents,
            input.ledger.providerCostCents,
            input.ledger.netCents,
            input.ledger.releaseDate,
            input.ledger.expectedPayoutDate,
            now,
            input.intentId,
            input.paidAt,
            input.ledger.chargedCents,
            input.ledger.serviceFeeCents,
          ),
        // Ticket 12: Pedido já cancelado (ex.: PIX vencido) → Estorno total no mesmo batch.
        ...lateRefundStatements(d1, {
          intentId: input.intentId,
          paidAt: input.paidAt,
          now,
          compensationPayoutDate: input.ledger.expectedPayoutDate,
        }),
        d1
          .prepare(
            `SELECT (SELECT COUNT(*) FROM ledger_entries WHERE id = ?) AS applied,
                    (SELECT state FROM payment_intents WHERE id = ?) AS state`,
          )
          .bind(ledgerId, input.intentId),
      );
      const results = await d1.batch(statements);
      const last = (
        results[results.length - 1]?.results as
          { applied: number; state: PaymentIntentState | null }[] | undefined
      )?.[0];
      if (last?.applied === 1) return "applied";
      return last?.state === "paid" ? "already_applied" : "rejected";
    },

    /** Custo vigente do provedor na tabela do Ops (fallback quando o provedor não informa). */
    async providerCostAt(
      provider: PaymentProviderName,
      operation: "pix_charge" | "card_charge",
      at: string,
    ): Promise<{ percentBps: number; fixedCents: number } | null> {
      const row = await d1
        .prepare(
          `SELECT percent_bps AS percentBps, fixed_cents AS fixedCents FROM provider_costs
           WHERE provider = ? AND operation = ? AND valid_from <= ?
             AND (valid_to IS NULL OR valid_to > ?)
           ORDER BY valid_from DESC LIMIT 1`,
        )
        .bind(provider, operation, at, at)
        .first<{ percentBps: number; fixedCents: number }>();
      return row ?? null;
    },

    /**
     * Pagamentos de uma Loja para conferência (Ops e testes): intenções, lançamentos do Ledger e
     * desfechos dos eventos de webhook na ordem em que chegaram. Só leitura.
     */
    async paymentsOfStore(storeId: string) {
      const [intents, ledger, events] = await d1.batch([
        d1.prepare("SELECT id, state FROM payment_intents WHERE store_id = ?").bind(storeId),
        d1
          .prepare("SELECT id, intent_id AS intentId FROM ledger_entries WHERE store_id = ?")
          .bind(storeId),
        d1
          .prepare(
            `SELECT e.outcome AS outcome FROM payment_webhook_events e
             JOIN payment_intents i ON i.id = e.intent_id WHERE i.store_id = ? ORDER BY e.rowid`,
          )
          .bind(storeId),
      ]);
      return {
        intents: (intents?.results ?? []) as { id: string; state: PaymentIntentState }[],
        ledger: (ledger?.results ?? []) as { id: string; intentId: string }[],
        outcomes: ((events?.results ?? []) as { outcome: WebhookEventOutcome }[]).map(
          (event) => event.outcome,
        ),
      };
    },

    /** Lançamento do Ledger da intenção (conferência e testes). */
    async ledgerOfIntent(intentId: string) {
      return d1
        .prepare(
          `SELECT store_id AS storeId, order_id AS orderId, charged_cents AS chargedCents,
             order_total_cents AS orderTotalCents, service_fee_cents AS serviceFeeCents,
             foode_fee_cents AS foodeFeeCents, provider_cost_cents AS providerCostCents,
             net_cents AS netCents, release_date AS releaseDate,
             expected_payout_date AS expectedPayoutDate, custody, provider, method
           FROM ledger_entries WHERE intent_id = ?`,
        )
        .bind(intentId)
        .all<{
          storeId: string;
          orderId: string;
          chargedCents: number;
          orderTotalCents: number;
          serviceFeeCents: number;
          foodeFeeCents: number;
          providerCostCents: number | null;
          netCents: number;
          releaseDate: string;
          expectedPayoutDate: string;
          custody: string;
          provider: string;
          method: string;
        }>()
        .then((r) => r.results);
    },
  };
}

export type PaymentOps = ReturnType<typeof createPaymentOps>;
