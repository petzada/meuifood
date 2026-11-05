// Contrato do Ticket 15 sem banco: a migration 0011 é só expand — duas tabelas novas (trava do
// Cron e liberação confirmada do Cartão) e `order_cancellations.system_reason` por ADD COLUMN com
// CHECK (sem recriar a tabela), com o mesmo CHECK que o schema declara.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  ledgerReleaseConfirmations,
  MAINTENANCE_LOCK_NAMES,
  maintenanceLocks,
} from "./reconciliation";
import { ORDER_SYSTEM_CANCEL_REASONS, orderCancellations } from "./refunds";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const migration = readFileSync(join(migrationsDir, "0011_reconciliacao_cron.sql"), "utf8");
const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};
const code = migration.replace(/--[^\n]*/g, "");

describe("migration 0011 (reconciliação por Cron)", () => {
  it("é só expand: tabelas novas e ADD COLUMN nullable, sem DROP/RENAME/recriação", () => {
    expect(code).not.toMatch(/\bDROP\b|\bRENAME\b|__new_|PRAGMA/i);
    expect(code).toContain("CREATE TABLE `maintenance_locks`");
    expect(code).toContain("CREATE TABLE `ledger_release_confirmations`");
    expect(code).toMatch(/ALTER TABLE `order_cancellations` ADD `system_reason` text CONSTRAINT/);
    expect(code).not.toMatch(/ADD `system_reason`[^;]*NOT NULL/);
  });

  it("o CHECK do motivo de sistema é o mesmo do schema (sem autor, sem motivo escolhido)", () => {
    const check = getTableConfig(orderCancellations).checks.find(
      (candidate) => candidate.name === "order_cancellations_system_reason_only",
    );
    expect(check).toBeDefined();
    expect(code).toContain(
      `"system_reason" IS NULL OR ("system_reason" IN ('card_abandoned') AND "reason" IS NULL AND "actor_user_id" IS NULL)`,
    );
    expect(ORDER_SYSTEM_CANCEL_REASONS).toEqual(["card_abandoned"]);
  });

  it("trava por rotina e liberação confirmada uma vez por lançamento", () => {
    expect(MAINTENANCE_LOCK_NAMES).toEqual(["payments", "settlement"]);
    expect(getTableConfig(maintenanceLocks).columns.find((c) => c.name === "name")?.primary).toBe(
      true,
    );
    const confirmation = getTableConfig(ledgerReleaseConfirmations);
    expect(confirmation.columns.find((c) => c.name === "ledger_entry_id")?.primary).toBe(true);
    expect(code).toContain(`CHECK("expected_payout_date" > "release_date")`);
    // Nada de dado do pagador nem corpo do provedor.
    for (const table of [maintenanceLocks, ledgerReleaseConfirmations]) {
      const columns = getTableConfig(table).columns.map((c) => c.name);
      for (const forbidden of [/cpf/, /email/, /phone/, /token/, /body/, /payload/]) {
        expect(columns.filter((name) => forbidden.test(name))).toEqual([]);
      }
    }
  });

  it("0011 vem logo depois da 0010", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf("0011_reconciliacao_cron")).toBe(
      tags.indexOf("0010_cancelamento_estorno") + 1,
    );
  });
});
