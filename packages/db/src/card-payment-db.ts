// Cartão de crédito no D1 (Ticket 27, migration 0009): CONTRATO. As assinaturas abaixo são a
// porta única da api para o Cartão; a implementação (UPDATEs condicionais no estado anterior e a
// confirmação num único `batch`: evento + intenção + `card_payments` + Pedido + Ledger + retenções)
// entra no Ticket 27. Mesmo modelo do PIX (payment-db.ts): sem StoreContext, a Loja sai sempre da
// intenção gravada, nunca do request. Nada aqui guarda token do cartão, CPF, e-mail ou nascimento.
import type {
  CardDeclineReason,
  CardPaymentState,
  CardReleaseSource,
  PaymentIntentState,
} from "./schema";
import type { ConfirmPaymentResult, LedgerSnapshotInput, WebhookEventInput } from "./payment-db";

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
};

/**
 * Nova tentativa ("Tentar outro cartão") num Pedido `credit` já criado. O valor, a tarifa de
 * serviço e a taxa Foode vêm do Pedido/da tabela vigente (nunca do request). A 1ª tentativa nasce
 * na mesma escrita do Pedido (storefront-order-db, Ticket 27) com `attemptKey` = `idempotencyKey`.
 */
export type CreateCardAttemptInput = {
  orderId: string;
  attemptKey: string;
  brand: CardBrandName | null;
  lastFour: string | null;
};

export type CreateCardAttemptResult =
  | { ok: true; intentId: string; replayed: boolean }
  | {
      ok: false;
      /** Já há tentativa viva (creating/pending/paid), Pedido não aceita mais Cartão, ou sem taxa. */
      error: "attempt_active" | "order_not_payable" | "fee_unavailable";
    };

/** Resposta da criação da cobrança no provedor (Efí one-step ou AbacatePay transparente). */
export type RecordCardChargeInput = {
  intentId: string;
  providerChargeId: string;
  providerStatus: string;
  /** `pending` (em análise) ou `processing` (sem desfecho ainda). Aprovado vai por confirm. */
  state: Extract<CardPaymentState, "processing" | "pending">;
  efiNotificationToken: string | null;
  providerFeeCents: number | null;
  devMode: boolean;
};

export type DeclineCardInput = {
  intentId: string;
  reason: CardDeclineReason;
  providerStatus: string | null;
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
  /** Evento do webhook que confirmou (null = consulta autenticada). */
  event: WebhookEventInput | null;
};

/** Porta do Cartão no D1 (implementação no Ticket 27). */
export type CardPaymentOps = {
  createAttempt(input: CreateCardAttemptInput): Promise<CreateCardAttemptResult>;
  /** Última tentativa do Pedido (a que a página do Pedido mostra). */
  latestOfOrder(orderId: string): Promise<CardIntentView | null>;
  byAttempt(orderId: string, attemptKey: string): Promise<CardIntentView | null>;
  byProviderCharge(
    provider: CardProviderName,
    providerChargeId: string,
  ): Promise<CardIntentView | null>;
  byEfiNotificationToken(token: string): Promise<CardIntentView | null>;
  /** Lease da chamada ao provedor (mesma regra do PIX). */
  claimChargeAttempt(intentId: string, now: string, staleBefore: string): Promise<boolean>;
  recordCharge(input: RecordCardChargeInput): Promise<boolean>;
  decline(input: DeclineCardInput): Promise<boolean>;
  /** Efí: avança o último evento visto da notificação (só para frente). */
  advanceEfiEvents(intentId: string, lastEventId: number): Promise<boolean>;
  markChecked(intentId: string, now: string): Promise<void>;
  /** Confirmação canônica: um `batch` (evento + intenção + cartão + Pedido + Ledger). */
  confirm(input: ConfirmCardPaymentInput): Promise<ConfirmPaymentResult>;
};

export function createCardPaymentOps(d1: D1Database): CardPaymentOps {
  void d1;
  const pending = (name: keyof CardPaymentOps) => () =>
    Promise.reject(new Error(`cardPayments.${name}: implementação no Ticket 27`));
  return {
    createAttempt: pending("createAttempt"),
    latestOfOrder: pending("latestOfOrder"),
    byAttempt: pending("byAttempt"),
    byProviderCharge: pending("byProviderCharge"),
    byEfiNotificationToken: pending("byEfiNotificationToken"),
    claimChargeAttempt: pending("claimChargeAttempt"),
    recordCharge: pending("recordCharge"),
    decline: pending("decline"),
    advanceEfiEvents: pending("advanceEfiEvents"),
    markChecked: pending("markChecked"),
    confirm: pending("confirm"),
  };
}
