// Reconciliação de pagamentos, Estornos e repasses por Cron Trigger (Ticket 15; decisões 59 e 60).
// O handler `scheduled` do Worker `foode-api` (src/index.ts) chama `runReconciliation`: nada de
// worker sempre-on, fila externa ou Redis. Dois Crons (apps/api/wrangler.jsonc):
//
// - `*/5 * * * *` → rotina `payments`: PIX sem webhook (aberto e pago tarde), PIX vencido, Cartão
//   sem desfecho, Cartão abandonado e Estornos pendentes/falhos/sem confirmação. 5 min é o menor
//   passo que mantém o prazo do PIX (30 min) e o backoff do Estorno (≥ 1 min) com folga, sem gastar
//   chamadas à toa nos provedores (cada fase tem intervalo mínimo por item).
// - `0 9 * * *` (06:00 em São Paulo) → rotina `settlement`: liberações do Cartão confirmadas no
//   provedor atualizam a data de repasse prevista e as divergências da obrigação de repasse viram
//   alerta — antes do lote diário do Ops (decisão 60). Uma vez por dia basta: a liberação é em dias
//   úteis e a consulta de cada lançamento é limitada a uma a cada 20 h.
//
// Concorrência: trava leve por rotina no D1 (`maintenance_locks`): duas execuções sobrepostas = uma
// roda e a outra registra `skipped`; por baixo, cada escrita já é idempotente (UPDATE condicional,
// lease, identidade única), então até uma trava vencida não duplica efeito.
// Observável: um resumo JSON por execução nos Workers Logs (contagens por unidade e falhas) e no
// Sentry (check-in do Cron Monitor; falha parcial e divergência como mensagens). Uma unidade que
// falha não esconde as demais. Nunca segredos, telefone, CPF, e-mail, ids de cobrança/Pedido.
import { createFoodeDb } from "@foode/db";
import * as Sentry from "@sentry/cloudflare";

import type { Env } from "./env";
import { createPaymentMaintenance, type PaymentMaintenance } from "./payment-maintenance";
import type { FetchLike } from "./providers/abacatepay/client";

export const CRON_PAYMENTS = "*/5 * * * *";
export const CRON_SETTLEMENT = "0 9 * * *";

export type ReconciliationJob = "payments" | "settlement";

/** Validade da trava: depois disso uma execução que morreu no meio não prende a próxima. */
export const LOCK_LEASE_MS: Record<ReconciliationJob, number> = {
  payments: 10 * 60_000,
  settlement: 30 * 60_000,
};

/** Rotina do Cron disparado; qualquer outro (ex.: teste manual) roda a de 5 min. */
export function jobOfCron(cron: string): ReconciliationJob {
  return cron.trim() === CRON_SETTLEMENT ? "settlement" : "payments";
}

export type UnitCounts = Record<string, number>;
export type ReconciliationUnit = { name: string; run: () => Promise<UnitCounts> };

export type ReconciliationSummary = {
  message: "reconciliation_run";
  job: ReconciliationJob;
  cron: string;
  scheduledTime: string;
  status: "ok" | "partial" | "skipped";
  /** Contagens por unidade (só números). */
  units: Record<string, UnitCounts>;
  /** Unidades que falharam inteiras (código curto, nunca a mensagem). */
  failedUnits: { unit: string; code: string }[];
  /** Itens que falharam dentro das unidades (ficam para a próxima execução). */
  itemFailures: number;
  durationMs: number;
};

/** Saída observável (padrão: Workers Logs + Sentry). Só campos seguros. */
export type ReconciliationReporter = {
  log(summary: ReconciliationSummary): void;
  alert(
    message: "reconciliation_partial_failure" | "payout_divergence",
    level: "warning" | "error",
    tags: Record<string, string>,
    counts: UnitCounts,
  ): void;
};

export const defaultReporter: ReconciliationReporter = {
  log(summary) {
    const line = JSON.stringify({
      level: summary.status === "partial" ? "error" : "info",
      ...summary,
    });
    if (summary.status === "partial") console.error(line);
    else console.log(line);
  },
  alert(message, level, tags, counts) {
    console.warn(JSON.stringify({ level: "warn", message, ...tags, counts }));
    Sentry.captureMessage(message, { level, tags, extra: { counts } });
  },
};

/** Código curto do erro: o nome, nunca a mensagem (pode conter dado do provedor). */
export function unitErrorCode(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 80) || "Error" : "unknown";
}

const ITEM_FAILURE_KEYS = ["failed", "checkFailed"];

/** Roda as unidades em sequência; uma falha não interrompe as demais. */
export async function runUnits(units: readonly ReconciliationUnit[]) {
  const counts: Record<string, UnitCounts> = {};
  const failedUnits: { unit: string; code: string }[] = [];
  let itemFailures = 0;
  for (const unit of units) {
    try {
      const result = await unit.run();
      counts[unit.name] = result;
      for (const key of ITEM_FAILURE_KEYS) itemFailures += result[key] ?? 0;
    } catch (error) {
      failedUnits.push({ unit: unit.name, code: unitErrorCode(error) });
    }
  }
  return { units: counts, failedUnits, itemFailures };
}

/** Unidades de cada rotina, na ordem: primeiro convergir o que o provedor já sabe. */
export function unitsFor(
  job: ReconciliationJob,
  maintenance: PaymentMaintenance,
  now: Date,
  reporter: ReconciliationReporter,
): ReconciliationUnit[] {
  if (job === "settlement") {
    return [
      { name: "cardReleases", run: () => maintenance.reconcileCardReleases(now) },
      {
        name: "payoutDivergences",
        run: async () => {
          const divergences = await maintenance.detectPayoutDivergences(now);
          const total = Object.values(divergences).reduce((sum, value) => sum + value, 0);
          if (total > 0) {
            const kinds = Object.entries(divergences)
              .filter(([, value]) => value > 0)
              .map(([kind]) => kind);
            // Só alerta: dinheiro nunca é corrigido automaticamente.
            reporter.alert(
              "payout_divergence",
              "warning",
              { job, kinds: kinds.join(",") },
              divergences,
            );
          }
          return { ...divergences, total };
        },
      },
    ];
  }
  return [
    { name: "pixReconcile", run: () => maintenance.reconcilePix(now) },
    { name: "pixExpire", run: () => maintenance.expireUnpaidPix(now) },
    { name: "cardStale", run: () => maintenance.expireStaleCardAttempts(now) },
    { name: "cardAbandoned", run: () => maintenance.cancelAbandonedCards(now) },
    { name: "refunds", run: () => maintenance.retryPendingRefunds(now) },
  ];
}

export type RunReconciliationInput = {
  cron: string;
  /** `controller.scheduledTime`: o relógio de negócio de toda a execução. */
  scheduledTime: number;
  fetch?: FetchLike;
  reporter?: ReconciliationReporter;
};

/**
 * Uma execução do Cron: trava da rotina → unidades → resumo (log + Sentry) → solta a trava com o
 * resumo. Nunca lança: tudo o que der errado vira `partial` no resumo.
 */
export async function runReconciliation(
  env: Env,
  input: RunReconciliationInput,
): Promise<ReconciliationSummary> {
  const job = jobOfCron(input.cron);
  const reporter = input.reporter ?? defaultReporter;
  const now = new Date(input.scheduledTime);
  const started = Date.now();
  const summary: ReconciliationSummary = {
    message: "reconciliation_run",
    job,
    cron: input.cron,
    scheduledTime: now.toISOString(),
    status: "ok",
    units: {},
    failedUnits: [],
    itemFailures: 0,
    durationMs: 0,
  };
  const db = createFoodeDb(env.DB);
  const holder = crypto.randomUUID();
  let acquired = false;
  try {
    // A trava é de concorrência real: relógio de parede, não o agendado.
    const wall = new Date();
    acquired = await db.reconciliation.acquireLock(
      job,
      holder,
      wall.toISOString(),
      new Date(wall.getTime() + LOCK_LEASE_MS[job]).toISOString(),
    );
    if (!acquired) {
      summary.status = "skipped";
    } else {
      const maintenance = createPaymentMaintenance(env, {
        ...(input.fetch ? { fetch: input.fetch } : {}),
        now: () => now,
      });
      Object.assign(summary, await runUnits(unitsFor(job, maintenance, now, reporter)));
    }
  } catch (error) {
    summary.failedUnits.push({ unit: "lock", code: unitErrorCode(error) });
  }
  if (summary.failedUnits.length > 0 || summary.itemFailures > 0) summary.status = "partial";
  summary.durationMs = Date.now() - started;
  if (acquired) {
    try {
      await db.reconciliation.releaseLock(
        job,
        holder,
        new Date().toISOString(),
        JSON.stringify({
          status: summary.status,
          units: summary.units,
          failedUnits: summary.failedUnits,
        }),
      );
    } catch (error) {
      // A trava vence sozinha (`LOCK_LEASE_MS`); o resumo ainda sai no log.
      summary.failedUnits.push({ unit: "unlock", code: unitErrorCode(error) });
      summary.status = "partial";
    }
  }
  reporter.log(summary);
  if (summary.status === "partial") {
    reporter.alert(
      "reconciliation_partial_failure",
      summary.failedUnits.length > 0 ? "error" : "warning",
      { job, failedUnits: summary.failedUnits.map((failure) => failure.unit).join(",") || "none" },
      { itemFailures: summary.itemFailures, failedUnits: summary.failedUnits.length },
    );
  }
  return summary;
}

/**
 * Handler `scheduled` do Worker: Cron Monitor do Sentry (check-in in_progress/ok) em volta da
 * execução. O trabalho vai em `ctx.waitUntil` (o runtime não corta a execução) e o handler também
 * o aguarda — o wrapper do Sentry só faz o flush depois que o handler resolve.
 */
export async function handleScheduled(
  controller: Pick<ScheduledController, "cron" | "scheduledTime">,
  env: Env,
  ctx: Pick<ExecutionContext, "waitUntil">,
): Promise<void> {
  const job = jobOfCron(controller.cron);
  const work = Sentry.withMonitor(
    `foode-api-reconciliacao-${job}`,
    () =>
      runReconciliation(env, { cron: controller.cron, scheduledTime: controller.scheduledTime }),
    {
      schedule: { type: "crontab", value: job === "settlement" ? CRON_SETTLEMENT : CRON_PAYMENTS },
      timezone: "Etc/UTC",
      checkinMargin: 5,
      maxRuntime: job === "settlement" ? 30 : 10,
    },
  ).then(() => undefined);
  ctx.waitUntil(work);
  await work;
}
