// Rotinas de manutenção do pagamento (Tickets 12 e 15) chamadas pelo handler `scheduled` (Cron
// Triggers, src/reconciliation.ts). Cada uma é idempotente (repetida ou concorrente = um único
// efeito lógico), usa os MESMOS adapters e fatos dos webhooks (consulta autenticada → as mesmas
// escritas de @foode/db) e não vaza dado pessoal nos logs.
//
// A cada 5 min (`payments`):
// - `reconcilePix(now)`: PIX aberto sem webhook é conferido (pago confirma cobrança + Ledger;
//   vencido no provedor cancela) e PIX vencido nas últimas 48 h também (pago tarde = Estorno total
//   do Pedido já cancelado).
// - `expireUnpaidPix(now)`: PIX vencido sem pagamento vira Pedido Cancelado (`pix_expired`), libera
//   o Cupom e sai da faixa de Pedidos; pago de fato (conferido no provedor) é confirmado.
// - `expireStaleCardAttempts(now)`: Cartão sem desfecho (`processing` além de 5 min) vira recusado
//   (libera outra tentativa); Cartão em análise é conferido no provedor.
// - `cancelAbandonedCards(now)`: Cartão recusado sem nova tentativa nem troca para PIX há 2 h vira
//   Pedido Cancelado (`card_abandoned`), libera o Cupom e sai da faixa.
// - `retryPendingRefunds(now)`: Estornos pendentes/falhos fora do backoff vão de novo ao provedor
//   que cobrou; Estornos aceitos sem webhook são conferidos por consulta autenticada.
// Uma vez por dia (`settlement`):
// - `reconcileCardReleases(now)`: liberação do Cartão confirmada no provedor move a data de
//   repasse prevista (nunca marca repasse efetivo).
// - `detectPayoutDivergences(now)`: contagens de obrigação de repasse divergente (alerta; nada é
//   corrigido automaticamente).
import { createFoodeDb, type PayoutDivergences } from "@foode/db";
import { saoPauloDate } from "@foode/shared/payment";

import {
  abacatePayCardFromEnv,
  type CancelAbandonedCardsSummary,
  createCardService,
  efiCardFromEnv,
  type ExpireStaleCardSummary,
  type ReconcileReleasesSummary,
} from "./card-service";
import type { Env } from "./env";
import {
  abacatePayFromEnv,
  createPixService,
  type ExpireUnpaidPixSummary,
  type ReconcilePixSummary,
} from "./pix-service";
import type { FetchLike } from "./providers/abacatepay/client";
import {
  createRefundService,
  refundGatewaysFromEnv,
  type RetryRefundsSummary,
} from "./refund-service";

export type PaymentMaintenance = {
  reconcilePix(now?: Date): Promise<ReconcilePixSummary>;
  retryPendingRefunds(now?: Date): Promise<RetryRefundsSummary>;
  expireUnpaidPix(now?: Date): Promise<ExpireUnpaidPixSummary>;
  expireStaleCardAttempts(now?: Date): Promise<ExpireStaleCardSummary>;
  cancelAbandonedCards(now?: Date): Promise<CancelAbandonedCardsSummary>;
  reconcileCardReleases(now?: Date): Promise<ReconcileReleasesSummary>;
  detectPayoutDivergences(now?: Date): Promise<PayoutDivergences>;
};

export function createPaymentMaintenance(
  env: Env,
  options: { fetch?: FetchLike; now?: () => Date } = {},
): PaymentMaintenance {
  const db = createFoodeDb(env.DB);
  const clock = options.now ?? (() => new Date());
  const refunds = createRefundService({
    db,
    gateways: refundGatewaysFromEnv(env, options.fetch),
    now: clock,
  });
  const card = createCardService({
    db,
    efi: efiCardFromEnv(env, options.fetch),
    abacatePay: abacatePayCardFromEnv(env, options.fetch),
    refunds,
    now: clock,
  });
  const pix = createPixService({
    db,
    provider: abacatePayFromEnv(env, options.fetch),
    card,
    refunds,
    now: clock,
  });
  return {
    reconcilePix: (now) => pix.reconcilePix(now),
    retryPendingRefunds: (now) => refunds.retryPendingRefunds(now),
    expireUnpaidPix: (now) => pix.expireUnpaidPix(now),
    expireStaleCardAttempts: (now) => card.expireStaleCardAttempts(now),
    cancelAbandonedCards: (now) => card.cancelAbandonedCards(now),
    reconcileCardReleases: (now) => card.reconcileCardReleases(now),
    detectPayoutDivergences: (now = clock()) =>
      db.reconciliation.payoutDivergences(saoPauloDate(now)),
  };
}
