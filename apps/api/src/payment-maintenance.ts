// Rotinas de manutenção do pagamento (Ticket 12) para o handler `scheduled` do Ticket 15. Ainda
// não há Cron Trigger no Worker: o 15 registra o handler e chama estas funções. Cada uma é
// idempotente (repetida ou concorrente = um único efeito lógico) e não vaza dado pessoal nos logs.
//
// - `retryPendingRefunds(now)`: Estornos pendentes/falhos fora do backoff vão de novo ao provedor
//   que cobrou; Estornos aceitos sem webhook são conferidos por consulta autenticada.
// - `expireUnpaidPix(now)`: PIX vencido sem pagamento vira Pedido Cancelado (`pix_expired`), libera
//   o Cupom e sai da faixa de Pedidos; pago de fato (conferido no provedor) é confirmado.
// - `expireStaleCardAttempts(now)`: Cartão sem desfecho (`processing` além de 5 min) vira recusado
//   (libera outra tentativa); Cartão em análise é conferido no provedor — sem depender de alguém
//   abrir a página do Pedido.
import { createFoodeDb } from "@foode/db";

import {
  abacatePayCardFromEnv,
  createCardService,
  efiCardFromEnv,
  type ExpireStaleCardSummary,
} from "./card-service";
import type { Env } from "./env";
import { abacatePayFromEnv, createPixService, type ExpireUnpaidPixSummary } from "./pix-service";
import type { FetchLike } from "./providers/abacatepay/client";
import {
  createRefundService,
  refundGatewaysFromEnv,
  type RetryRefundsSummary,
} from "./refund-service";

export type PaymentMaintenance = {
  retryPendingRefunds(now?: Date): Promise<RetryRefundsSummary>;
  expireUnpaidPix(now?: Date): Promise<ExpireUnpaidPixSummary>;
  expireStaleCardAttempts(now?: Date): Promise<ExpireStaleCardSummary>;
};

export function createPaymentMaintenance(
  env: Env,
  options: { fetch?: FetchLike } = {},
): PaymentMaintenance {
  const db = createFoodeDb(env.DB);
  const refunds = createRefundService({ db, gateways: refundGatewaysFromEnv(env, options.fetch) });
  const card = createCardService({
    db,
    efi: efiCardFromEnv(env, options.fetch),
    abacatePay: abacatePayCardFromEnv(env, options.fetch),
    refunds,
  });
  const pix = createPixService({
    db,
    provider: abacatePayFromEnv(env, options.fetch),
    card,
    refunds,
  });
  return {
    retryPendingRefunds: (now) => refunds.retryPendingRefunds(now),
    expireUnpaidPix: (now) => pix.expireUnpaidPix(now),
    expireStaleCardAttempts: (now) => card.expireStaleCardAttempts(now),
  };
}
