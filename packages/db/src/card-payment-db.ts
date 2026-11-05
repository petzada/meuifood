// Cartão de crédito no D1 (Ticket 27, migration 0009). Porta única da api para o Cartão. Mesmo
// modelo do PIX (payment-db.ts): sem StoreContext — quem chama é o sistema (checkout pelo Slug,
// página do Pedido pelo token conferido, webhook autenticado) — e a Loja sai sempre da intenção ou
// do Pedido gravados, nunca do request.
//
// - Tentativa = intenção `credit` (estado canônico creating → pending → paid | failed) + linha em
//   `card_payments` (estado público processing/pending/approved/declined). No máximo UMA tentativa
//   viva por Pedido (índice parcial): recusada (`failed`) libera "Tentar outro cartão". A chave da
//   tentativa (`attempt_key`) é a idempotência: mesma chave = mesma tentativa, sem cobrar de novo.
// - Toda transição é UPDATE condicional no estado anterior (sem regressão: pago nunca volta,
//   recusado só vira pago se o dinheiro de fato entrar e não houver outra tentativa viva).
// - A confirmação canônica é UM `batch`: evento (identidade única) + intenção `paid` + cartão
//   `approved` com a liberação prevista + Pedido `paid` + lançamento único no Ledger + retenções.
// Nada aqui guarda token do cartão, CPF, e-mail ou nascimento, nem registra log.
import { newId, utcNow } from "./conventions";
import type { ConfirmPaymentResult, LedgerSnapshotInput, WebhookEventInput } from "./payment-db";
import type {
  CardDeclineReason,
  CardPaymentState,
  CardReleaseSource,
  PaymentIntentState,
} from "./schema";

export type CardProviderName = "efi" | "abacatepay";
export type CardModeName = "normal" | "rapido";
export type CardBrandName =
  "visa" | "mastercard" | "elo" | "amex" | "hipercard" | "diners" | "other";

/** Tentativa de Cartão (intenção `credit` + `card_payments`) com o Pedido. */
export type CardIntentView = {
  intentId: string;
  storeId: string;
  orderId: string;
  attemptKey: string;
  provider: CardProviderName;
  cardMode: CardModeName;
  /** Estado canônico da intenção (creating/pending/paid/failed). */
  intentState: PaymentIntentState;
  /** Estado público do Cartão (processing/pending/approved/declined). */
  state: CardPaymentState;
  declineReason: CardDeclineReason | null;
  amountCents: number;
  serviceFeeCents: number;
  providerChargeId: string | null;
  providerStatus: string | null;
  brand: CardBrandName | null;
  lastFour: string | null;
  efiNotificationToken: string | null;
  efiLastEventId: number | null;
  providerFeeCents: number | null;
  approvedAt: string | null;
  expectedReleaseDate: string | null;
  releaseSource: CardReleaseSource | null;
  foodeFee: { feeId: string; percentBps: number; fixedCents: number };
  attemptStartedAt: string | null;
  checkedAt: string | null;
  createdAt: string;
  orderStatus: string;
  /** Número do Pedido na Loja (nome do item na fatura da Efí). */
  orderCode: number;
  /** Nome e telefone do Pedido: a Efí/AbacatePay exigem no pagador (nunca logar). */
  customerName: string;
  customerPhoneE164: string;
};

type CardRow = Omit<CardIntentView, "foodeFee"> & {
  foodeFeeId: string;
  foodeFeePercentBps: number;
  foodeFeeFixedCents: number;
};

const CARD_SELECT = `SELECT i.id AS intentId, i.store_id AS storeId, i.order_id AS orderId,
  c.attempt_key AS attemptKey, i.provider AS provider, i.card_mode AS cardMode,
  i.state AS intentState, c.state AS state, c.decline_reason AS declineReason,
  i.amount_cents AS amountCents, i.service_fee_cents AS serviceFeeCents,
  i.provider_charge_id AS providerChargeId, c.provider_status AS providerStatus, c.brand AS brand,
  c.last_four AS lastFour, c.efi_notification_token AS efiNotificationToken,
  c.efi_last_event_id AS efiLastEventId, i.provider_fee_cents AS providerFeeCents,
  c.approved_at AS approvedAt, c.expected_release_date AS expectedReleaseDate,
  c.release_source AS releaseSource, i.foode_fee_id AS foodeFeeId,
  i.foode_fee_percent_bps AS foodeFeePercentBps, i.foode_fee_fixed_cents AS foodeFeeFixedCents,
  i.attempt_started_at AS attemptStartedAt, i.checked_at AS checkedAt, i.created_at AS createdAt,
  o.status AS orderStatus, o.code AS orderCode, o.customer_name AS customerName,
  o.customer_phone_e164 AS customerPhoneE164
  FROM payment_intents i
  JOIN card_payments c ON c.intent_id = i.id
  JOIN orders o ON o.store_id = i.store_id AND o.id = i.order_id`;

function toView(row: CardRow | null): CardIntentView | null {
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

/** Status cru do provedor cabe no CHECK (1–40). */
function shortStatus(status: string | null): string | null {
  const value = status?.trim().slice(0, 40);
  return value ? value : null;
}

/**
 * Nova tentativa ("Tentar outro cartão") num Pedido `credit` já criado. O valor e a tarifa de
 * serviço vêm do Pedido; o provedor/modo e a taxa Foode vigente do modo ATUAL da Loja vêm da api
 * (tabela vigente, nunca do request). A 1ª tentativa nasce na mesma escrita do Pedido
 * (storefront-order-db) com `attemptKey` = `idempotencyKey`.
 */
export type CreateCardAttemptInput = {
  orderId: string;
  attemptKey: string;
  provider: CardProviderName;
  cardMode: CardModeName;
  foodeFee: { feeId: string; percentBps: number; fixedCents: number };
  brand: CardBrandName | null;
  lastFour: string | null;
  /** Instante da api (o mesmo relógio do lease e do prazo); padrão = agora. */
  now?: string;
};

export type CreateCardAttemptResult =
  | { ok: true; intentId: string; replayed: boolean }
  | {
      ok: false;
      /** Já há tentativa viva (creating/pending/paid) ou o Pedido não aceita mais Cartão. */
      error: "attempt_active" | "order_not_payable";
    };

/** Resposta da criação da cobrança no provedor (Efí one-step ou AbacatePay transparente). */
export type RecordCardChargeInput = {
  intentId: string;
  providerChargeId: string;
  providerStatus: string;
  /** `pending` (em análise) ou `processing` (sem desfecho ainda). Aprovado vai por confirm. */
  state: Extract<CardPaymentState, "processing" | "pending">;
  providerFeeCents: number | null;
  devMode: boolean;
};

export type DeclineCardInput = {
  intentId: string;
  reason: CardDeclineReason;
  providerStatus: string | null;
  /** Cobrança que o provedor recusou (null = nem chegou a existir). */
  providerChargeId: string | null;
  /** Código curto do erro (vai em `payment_intents.failure_code`), sem corpo nem dado pessoal. */
  failureCode: string;
  event: WebhookEventInput | null;
};

/** Retenção do provedor como parcela separada do lançamento. */
export type LedgerRetentionInput = {
  amountCents: number;
  releaseDate: string;
  expectedPayoutDate: string;
};

export type ConfirmCardPaymentInput = {
  intentId: string;
  providerChargeId: string;
  amountCents: number;
  approvedAt: string;
  providerStatus: string;
  providerFeeCents: number | null;
  expectedReleaseDate: string;
  releaseSource: CardReleaseSource;
  ledger: LedgerSnapshotInput;
  retentions: readonly LedgerRetentionInput[];
  /** Evento do webhook que confirmou (null = resposta/consulta autenticada ao provedor). */
  event: WebhookEventInput | null;
};

/** Pedido que ainda aceita uma tentativa de Cartão. */
const ORDER_PAYABLE = `o.payment_method = 'credit' AND o.payment_status = 'awaiting'
  AND o.status <> 'cancelled'`;
const LIVE_ATTEMPT = `SELECT 1 FROM payment_intents x WHERE x.store_id = o.store_id
  AND x.order_id = o.id AND x.method = 'credit' AND x.state IN ('creating', 'pending', 'paid')`;

export function createCardPaymentOps(d1: D1Database) {
  async function cardWhere(where: string, ...binds: unknown[]): Promise<CardIntentView | null> {
    const row = await d1
      .prepare(`${CARD_SELECT} WHERE ${where}`)
      .bind(...binds)
      .first<CardRow>();
    return toView(row);
  }

  return {
    async createAttempt(input: CreateCardAttemptInput): Promise<CreateCardAttemptResult> {
      const attemptKey = input.attemptKey.toLowerCase();
      const intentId = newId();
      const now = input.now ?? utcNow();
      const [, , found, order] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO payment_intents (id, store_id, order_id, provider, method, card_mode,
               custody, amount_cents, service_fee_cents, foode_fee_id, foode_fee_percent_bps,
               foode_fee_fixed_cents, state, created_at, updated_at)
             SELECT ?, o.store_id, o.id, ?, 'credit', ?, 'pilot_platform',
               o.total_cents + o.service_fee_cents, o.service_fee_cents, ?, ?, ?, 'creating', ?, ?
             FROM orders o
             WHERE o.id = ? AND ${ORDER_PAYABLE} AND NOT EXISTS (${LIVE_ATTEMPT})
               AND NOT EXISTS (SELECT 1 FROM card_payments c WHERE c.store_id = o.store_id
                 AND c.order_id = o.id AND c.attempt_key = ?)
             ON CONFLICT DO NOTHING`,
          )
          .bind(
            intentId,
            input.provider,
            input.cardMode,
            input.foodeFee.feeId,
            input.foodeFee.percentBps,
            input.foodeFee.fixedCents,
            now,
            now,
            input.orderId,
            attemptKey,
          ),
        d1
          .prepare(
            `INSERT INTO card_payments (intent_id, store_id, order_id, attempt_key, state, brand,
               last_four, created_at, updated_at)
             SELECT id, store_id, order_id, ?, 'processing', ?, ?, ?, ? FROM payment_intents
             WHERE id = ?
             ON CONFLICT DO NOTHING`,
          )
          .bind(attemptKey, input.brand, input.lastFour, now, now, intentId),
        d1
          .prepare(
            `SELECT c.intent_id AS intentId FROM card_payments c
             JOIN orders o ON o.store_id = c.store_id AND o.id = c.order_id
             WHERE o.id = ? AND c.attempt_key = ?`,
          )
          .bind(input.orderId, attemptKey),
        d1
          .prepare(
            `SELECT (${ORDER_PAYABLE.replaceAll("\n", " ")}) AS payable FROM orders o WHERE o.id = ?`,
          )
          .bind(input.orderId),
      ]);
      const row = (found?.results as { intentId: string }[] | undefined)?.[0];
      if (row) return { ok: true, intentId: row.intentId, replayed: row.intentId !== intentId };
      const payable = (order?.results as { payable: number }[] | undefined)?.[0]?.payable === 1;
      return { ok: false, error: payable ? "attempt_active" : "order_not_payable" };
    },

    /** Última tentativa do Pedido (a que a página do Pedido mostra). */
    latestOfOrder(orderId: string): Promise<CardIntentView | null> {
      return cardWhere(
        // Ordem de gravação (rowid), não o relógio: a última tentativa é a última inserida.
        `i.order_id = ? AND i.method = 'credit' ORDER BY i.rowid DESC LIMIT 1`,
        orderId,
      );
    },

    byIntentId(intentId: string): Promise<CardIntentView | null> {
      return cardWhere(`i.id = ?`, intentId);
    },

    byAttempt(orderId: string, attemptKey: string): Promise<CardIntentView | null> {
      return cardWhere(`i.order_id = ? AND c.attempt_key = ?`, orderId, attemptKey.toLowerCase());
    },

    byProviderCharge(
      provider: CardProviderName,
      providerChargeId: string,
    ): Promise<CardIntentView | null> {
      return cardWhere(
        `i.provider = ? AND i.provider_charge_id = ? AND i.method = 'credit'`,
        provider,
        providerChargeId,
      );
    },

    byEfiNotificationToken(token: string): Promise<CardIntentView | null> {
      return cardWhere(`c.efi_notification_token = ?`, token);
    },

    /**
     * Reserva a chamada ao provedor. Diferente do PIX, NUNCA reabre por lease vencido: o token do
     * cartão é de uso único e uma chamada sem resposta (timeout) pode ter cobrado — a confirmação
     * chega pelo webhook/notificação (custom_id/intentId) ou a tentativa vence (`decline`).
     */
    async claimChargeAttempt(intentId: string, now: string): Promise<boolean> {
      const result = await d1
        .prepare(
          `UPDATE payment_intents SET attempt_started_at = ?, updated_at = ?
           WHERE id = ? AND method = 'credit' AND state = 'creating'
             AND provider_charge_id IS NULL AND attempt_started_at IS NULL`,
        )
        .bind(now, now, intentId)
        .run();
      return changed(result);
    },

    /** Cobrança criada sem desfecho (creating → pending; cartão processing → processing/pending). */
    async recordCharge(input: RecordCardChargeInput): Promise<boolean> {
      const now = utcNow();
      const [intent] = await d1.batch([
        d1
          .prepare(
            `UPDATE payment_intents SET state = 'pending', provider_charge_id = ?,
               provider_fee_cents = COALESCE(?, provider_fee_cents), dev_mode = ?, updated_at = ?
             WHERE id = ? AND method = 'credit' AND state = 'creating'
               AND (provider_charge_id IS NULL OR provider_charge_id = ?)`,
          )
          .bind(
            input.providerChargeId,
            input.providerFeeCents,
            input.devMode ? 1 : 0,
            now,
            input.intentId,
            input.providerChargeId,
          ),
        d1
          .prepare(
            `UPDATE card_payments SET state = ?, provider_status = ?, updated_at = ?
             WHERE intent_id = ? AND state IN ('processing', 'pending')
               AND EXISTS (SELECT 1 FROM payment_intents WHERE id = ? AND state = 'pending'
                 AND provider_charge_id = ?)`,
          )
          .bind(
            input.state,
            shortStatus(input.providerStatus),
            now,
            input.intentId,
            input.intentId,
            input.providerChargeId,
          ),
      ]);
      return changed(intent);
    },

    /** Recusa (ou desistência): intenção `failed` e cartão `declined`, só de creating/pending. */
    async decline(input: DeclineCardInput): Promise<boolean> {
      const now = utcNow();
      const eventRowId = newId();
      const statements: D1PreparedStatement[] = [];
      if (input.event) {
        statements.push(
          d1
            .prepare(
              `INSERT INTO payment_webhook_events (id, provider, event_id, event_type,
                 provider_charge_id, intent_id, outcome, dev_mode, received_at)
               SELECT ?, ?, ?, ?, ?, ?,
                 CASE WHEN EXISTS (SELECT 1 FROM payment_intents WHERE id = ?
                   AND state IN ('creating', 'pending')) THEN 'applied' ELSE 'already_applied' END,
                 ?, ?
               WHERE 1
               ON CONFLICT(provider, event_id) DO NOTHING`,
            )
            .bind(
              eventRowId,
              input.event.provider,
              input.event.eventId,
              input.event.eventType.slice(0, 80),
              input.providerChargeId,
              input.intentId,
              input.intentId,
              input.event.devMode ? 1 : 0,
              now,
            ),
        );
      }
      const eventGuard = input.event
        ? `AND EXISTS (SELECT 1 FROM payment_webhook_events WHERE id = '${eventRowId}')`
        : "";
      statements.push(
        d1
          .prepare(
            `UPDATE payment_intents SET state = 'failed', failure_code = ?,
               provider_charge_id = COALESCE(provider_charge_id, ?), updated_at = ?
             WHERE id = ? AND method = 'credit' AND state IN ('creating', 'pending')
               AND (? IS NULL OR provider_charge_id IS NULL OR provider_charge_id = ?) ${eventGuard}`,
          )
          .bind(
            input.failureCode.slice(0, 80) || "declined",
            input.providerChargeId,
            now,
            input.intentId,
            input.providerChargeId,
            input.providerChargeId,
          ),
        d1
          .prepare(
            `UPDATE card_payments SET state = 'declined', decline_reason = ?,
               provider_status = COALESCE(?, provider_status), updated_at = ?
             WHERE intent_id = ? AND state IN ('processing', 'pending')
               AND EXISTS (SELECT 1 FROM payment_intents WHERE id = ? AND state = 'failed')`,
          )
          .bind(
            input.reason,
            shortStatus(input.providerStatus),
            now,
            input.intentId,
            input.intentId,
          ),
      );
      const results = await d1.batch(statements);
      return changed(results[input.event ? 1 : 0]);
    },

    /**
     * Efí: avança o último evento visto da notificação (só para frente) e guarda o token da
     * `notification_url` na 1ª notificação (o mesmo em todo o ciclo da cobrança).
     */
    async advanceEfiEvents(
      intentId: string,
      lastEventId: number,
      token: string | null = null,
    ): Promise<boolean> {
      const result = await d1
        .prepare(
          `UPDATE card_payments SET efi_last_event_id = ?,
             efi_notification_token = COALESCE(efi_notification_token, ?), updated_at = ?
           WHERE intent_id = ? AND (efi_last_event_id IS NULL OR efi_last_event_id < ?)`,
        )
        .bind(lastEventId, token, utcNow(), intentId, lastEventId)
        .run();
      return changed(result);
    },

    /** Última consulta autenticada ao provedor (limita a reconciliação por polling). */
    async markChecked(intentId: string, now: string): Promise<void> {
      await d1
        .prepare(`UPDATE payment_intents SET checked_at = ? WHERE id = ?`)
        .bind(now, intentId)
        .run();
    },

    /**
     * Confirmação canônica num único `batch`: evento (identidade única) → intenção `paid` (de
     * creating/pending; de `failed` só se não houver outra tentativa viva) → cartão `approved` com
     * a liberação prevista → Pedido `paid` (entra na fila do Painel) → lançamento único no Ledger
     * → retenções. Evento repetido ou intenção já paga = nada muda.
     */
    async confirm(input: ConfirmCardPaymentInput): Promise<ConfirmPaymentResult> {
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
              input.event.eventType.slice(0, 80),
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
             WHERE id = ? AND method = 'credit' AND amount_cents = ?
               AND (provider_charge_id IS NULL OR provider_charge_id = ?)
               AND (state IN ('creating', 'pending') OR (state = 'failed' AND NOT EXISTS (
                 SELECT 1 FROM payment_intents x WHERE x.store_id = payment_intents.store_id
                   AND x.order_id = payment_intents.order_id AND x.method = 'credit'
                   AND x.id <> payment_intents.id AND x.state IN ('creating', 'pending', 'paid'))
                 AND EXISTS (SELECT 1 FROM orders y WHERE y.store_id = payment_intents.store_id
                   AND y.id = payment_intents.order_id AND y.payment_method = 'credit')))
               ${eventGuard}`,
          )
          .bind(
            input.approvedAt,
            input.providerChargeId,
            input.providerFeeCents,
            now,
            input.intentId,
            input.amountCents,
            input.providerChargeId,
          ),
        d1
          .prepare(
            `UPDATE card_payments SET state = 'approved', decline_reason = NULL, approved_at = ?,
               provider_status = ?, expected_release_date = ?, release_source = ?, updated_at = ?
             WHERE intent_id = ? AND state <> 'approved' AND EXISTS (
               SELECT 1 FROM payment_intents WHERE id = ? AND state = 'paid' AND paid_at = ?)`,
          )
          .bind(
            input.approvedAt,
            shortStatus(input.providerStatus),
            input.expectedReleaseDate,
            input.releaseSource,
            now,
            input.intentId,
            input.intentId,
            input.approvedAt,
          ),
        d1
          .prepare(
            `UPDATE orders SET payment_status = 'paid', updated_at = ?
             WHERE payment_status <> 'paid' AND (store_id, id) IN (
               SELECT store_id, order_id FROM payment_intents
               WHERE id = ? AND state = 'paid' AND paid_at = ?)`,
          )
          .bind(now, input.intentId, input.approvedAt),
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
            input.approvedAt,
            input.ledger.chargedCents,
            input.ledger.serviceFeeCents,
          ),
        ...input.retentions.map((retention) =>
          d1
            .prepare(
              `INSERT INTO ledger_retentions (id, store_id, order_id, ledger_entry_id, reason,
                 amount_cents, release_date, expected_payout_date, created_at)
               SELECT ?, store_id, order_id, id, 'provider_retention', ?, ?, ?, ?
               FROM ledger_entries WHERE id = ?`,
            )
            .bind(
              newId(),
              retention.amountCents,
              retention.releaseDate,
              retention.expectedPayoutDate,
              now,
              ledgerId,
            ),
        ),
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

    /**
     * "Pagar com PIX" depois do Cartão recusado, num único `batch`: o Pedido `credit` aguardando
     * pagamento, sem tentativa de Cartão viva e com pelo menos uma recusada passa a `pix` (mesmo
     * total e mesma tarifa de serviço) e ganha a intenção PIX (uma por Pedido, UNIQUE parcial) com
     * a taxa Foode vigente do PIX. Idempotente: repetir devolve a mesma intenção (`replayed`).
     * Depois da troca, uma aprovação atrasada do Cartão recusado não marca pago (`confirm` exige o
     * Pedido em `credit`): fica para o Estorno (Ticket 12).
     */
    async switchToPix(input: {
      orderId: string;
      foodeFee: { feeId: string; percentBps: number; fixedCents: number };
      /** Instante da api (o prazo da cobrança PIX conta a partir daqui); padrão = agora. */
      now?: string;
    }): Promise<
      | { ok: true; intentId: string; replayed: boolean }
      | { ok: false; error: "attempt_active" | "order_not_payable" }
    > {
      const intentId = newId();
      const now = input.now ?? utcNow();
      const [, , found, order] = await d1.batch([
        d1
          .prepare(
            `UPDATE orders AS o SET payment_method = 'pix', updated_at = ?
             WHERE o.id = ? AND ${ORDER_PAYABLE} AND NOT EXISTS (${LIVE_ATTEMPT})
               AND EXISTS (SELECT 1 FROM payment_intents f WHERE f.store_id = o.store_id
                 AND f.order_id = o.id AND f.method = 'credit' AND f.state = 'failed')`,
          )
          .bind(now, input.orderId),
        d1
          .prepare(
            `INSERT INTO payment_intents (id, store_id, order_id, provider, method, card_mode,
               custody, amount_cents, service_fee_cents, foode_fee_id, foode_fee_percent_bps,
               foode_fee_fixed_cents, state, created_at, updated_at)
             SELECT ?, o.store_id, o.id, 'abacatepay', 'pix', NULL, 'pilot_platform',
               o.total_cents + o.service_fee_cents, o.service_fee_cents, ?, ?, ?, 'creating', ?, ?
             FROM orders o
             WHERE o.id = ? AND o.payment_method = 'pix' AND o.payment_status = 'awaiting'
               AND NOT EXISTS (SELECT 1 FROM payment_intents p WHERE p.store_id = o.store_id
                 AND p.order_id = o.id AND p.method = 'pix')
             ON CONFLICT DO NOTHING`,
          )
          .bind(
            intentId,
            input.foodeFee.feeId,
            input.foodeFee.percentBps,
            input.foodeFee.fixedCents,
            now,
            now,
            input.orderId,
          ),
        d1
          .prepare(
            `SELECT p.id AS intentId FROM payment_intents p JOIN orders o
               ON o.store_id = p.store_id AND o.id = p.order_id
             WHERE o.id = ? AND o.payment_method = 'pix' AND p.method = 'pix'`,
          )
          .bind(input.orderId),
        d1
          .prepare(
            `SELECT (${ORDER_PAYABLE}) AS payable, EXISTS (${LIVE_ATTEMPT}) AS live
             FROM orders o WHERE o.id = ?`,
          )
          .bind(input.orderId),
      ]);
      const row = (found?.results as { intentId: string }[] | undefined)?.[0];
      if (row) return { ok: true, intentId: row.intentId, replayed: row.intentId !== intentId };
      const state = (order?.results as { payable: number; live: number }[] | undefined)?.[0];
      return {
        ok: false,
        error: state?.payable === 1 && state.live === 1 ? "attempt_active" : "order_not_payable",
      };
    },

    /** Retenções do lançamento da intenção (conferência e testes). */
    async retentionsOfIntent(intentId: string) {
      const { results } = await d1
        .prepare(
          `SELECT r.amount_cents AS amountCents, r.release_date AS releaseDate,
             r.expected_payout_date AS expectedPayoutDate
           FROM ledger_retentions r JOIN ledger_entries e ON e.id = r.ledger_entry_id
           WHERE e.intent_id = ? ORDER BY r.release_date`,
        )
        .bind(intentId)
        .all<{ amountCents: number; releaseDate: string; expectedPayoutDate: string }>();
      return results;
    },
  };
}

export type CardPaymentOps = ReturnType<typeof createCardPaymentOps>;
