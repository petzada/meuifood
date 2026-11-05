// Contrato do Ticket 12 sem banco: a migration 0010 cria o cancelamento (motivo), a obrigação de
// Estorno, a reversão do Ledger e a marca de repasse do lançamento — só tabelas novas (expand,
// nada existente muda) — e amarra tudo ao Pedido da MESMA Loja. Um Estorno por cobrança paga, chave idempotente única e
// uma reversão por lançamento (o lançamento original nunca é apagado nem editado).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  LEDGER_REVERSAL_KINDS,
  ledgerEntryPayouts,
  ledgerReversals,
  ORDER_CANCEL_REASONS,
  orderCancellations,
  REFUND_ORIGINS,
  REFUND_STATES,
  refunds,
} from "./refunds";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const migration = readFileSync(join(migrationsDir, "0010_cancelamento_estorno.sql"), "utf8");
const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

const tables: SQLiteTable[] = [refunds, ledgerReversals, orderCancellations, ledgerEntryPayouts];
const perOrder = new Set(["refunds", "ledger_reversals", "order_cancellations"]);
/** Acrescentados depois por ADD COLUMN (0011, Ticket 15; ver reconciliation-schema.test.ts). */
const LATER_COLUMNS = new Set(["system_reason"]);
const LATER_CHECKS = new Set(["order_cancellations_system_reason_only"]);

function tableSql(name: string): string {
  return migration.match(new RegExp(`CREATE TABLE \`${name}\` \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

describe("migration 0010 × schema/refunds.ts", () => {
  for (const table of tables) {
    const config = getTableConfig(table);
    it(`cria ${config.name} com todas as colunas, checks e índices`, () => {
      const body = tableSql(config.name);
      expect(body, config.name).not.toBe("");
      for (const check of config.checks) {
        if (!LATER_CHECKS.has(check.name)) expect(body).toContain(`CONSTRAINT "${check.name}"`);
      }
      const columnsInSql = [...body.matchAll(/^\t`(\w+)` /gm)].map((m) => m[1]);
      expect(columnsInSql.sort()).toEqual(
        config.columns
          .map((c) => c.name)
          .filter((name) => !LATER_COLUMNS.has(name))
          .sort(),
      );
      for (const index of config.indexes) {
        expect(migration).toContain(`INDEX \`${index.config.name}\` ON \`${config.name}\``);
      }
      if (perOrder.has(config.name)) {
        expect(body).toContain(
          "FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`)",
        );
      }
    });
  }

  it("um Estorno por cobrança paga, chave idempotente única e uma reversão por lançamento", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `refunds_intent_unique` ON `refunds` (`intent_id`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `refunds_idempotency_unique` ON `refunds` (`idempotency_key`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `ledger_reversals_entry_unique` ON `ledger_reversals` (`ledger_entry_id`)",
    );
  });

  it("estados, origens e tipos de reversão iguais ao contrato", () => {
    expect(REFUND_STATES).toEqual(["pending", "requested", "succeeded", "failed"]);
    expect(REFUND_ORIGINS).toEqual(["order_cancelled", "late_payment", "orphan_charge"]);
    expect(LEDGER_REVERSAL_KINDS).toEqual(["annulment", "compensated_debit"]);
    expect(ORDER_CANCEL_REASONS).toEqual([
      "item_unavailable",
      "no_courier",
      "customer_request",
      "other",
      "pix_expired",
    ]);
  });

  it("motivo opcional; sistema (PIX vencido) sem autor; repasse marcado por lançamento", () => {
    const reason = getTableConfig(orderCancellations).columns.find((c) => c.name === "reason");
    expect(reason?.notNull).toBe(false);
    expect(migration).toContain(`"reason" IS NOT 'pix_expired' OR "actor_user_id" IS NULL`);
    expect(migration).toContain(
      "FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`)",
    );
  });

  it("nenhum dado do pagador nem corpo do provedor na obrigação de Estorno", () => {
    const columns = getTableConfig(refunds).columns.map((c) => c.name);
    for (const forbidden of [/cpf/, /email/, /phone/, /token/, /body/, /payload/]) {
      expect(columns.filter((name) => forbidden.test(name))).toEqual([]);
    }
  });

  it("é só expand: tabelas novas, sem DROP/RENAME/recriação nem ALTER", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b|__new_|\bALTER\s+TABLE\b/i);
  });

  it("0010 vem logo depois da 0009", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf("0010_cancelamento_estorno")).toBe(
      tags.indexOf("0009_cartao_efi_abacatepay") + 1,
    );
  });
});
