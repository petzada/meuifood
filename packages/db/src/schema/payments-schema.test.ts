// Contrato do Ticket 26 sem banco: a migration 0007 cria cada tabela/coluna/índice/CHECK do
// pagamento online e do Ledger, é só expand e amarra intenção, evento e lançamento ao Pedido da
// MESMA Loja, com identidade única do evento e lançamento único por intenção.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { ORDER_PAYMENT_STATUSES, PAINEL_VISIBLE_PAYMENT_SQL } from "./orders";
import { ledgerEntries, paymentIntents, paymentWebhookEvents } from "./payments";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const migration = readFileSync(join(migrationsDir, "0007_pix_abacatepay_ledger.sql"), "utf8");
const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

const tables: SQLiteTable[] = [paymentIntents, paymentWebhookEvents, ledgerEntries];

function tableSql(name: string): string {
  return migration.match(new RegExp(`CREATE TABLE \`${name}\` \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

describe("migration 0007 × schema/payments.ts", () => {
  for (const table of tables) {
    const config = getTableConfig(table);
    it(`cria ${config.name} com todas as colunas, checks e índices`, () => {
      const body = tableSql(config.name);
      expect(body, config.name).not.toBe("");
      for (const check of config.checks) expect(body).toContain(`CONSTRAINT "${check.name}"`);
      const columnsInSql = [...body.matchAll(/^\t`(\w+)` /gm)].map((m) => m[1]);
      expect(columnsInSql.sort()).toEqual(config.columns.map((c) => c.name).sort());
      for (const index of config.indexes) {
        expect(migration).toContain(`INDEX \`${index.config.name}\` ON \`${config.name}\``);
      }
    });
  }

  it("intenção e lançamento apontam pela FK composta (store_id, order_id)", () => {
    for (const name of ["payment_intents", "ledger_entries"]) {
      expect(tableSql(name)).toContain(
        "FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`)",
      );
    }
  });

  it("evento com identidade única; um PIX por Pedido; um lançamento por intenção paga", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `payment_webhook_events_identity_unique` ON `payment_webhook_events` (`provider`,`event_id`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `payment_intents_pix_order_unique` ON `payment_intents` (`store_id`,`order_id`) WHERE \"method\" = 'pix'",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `ledger_entries_payment_intent_unique` ON `ledger_entries` (`intent_id`) WHERE \"kind\" = 'payment'",
    );
  });

  it("Ledger fecha as somas no banco: tarifa de serviço fora do líquido, repasse depois", () => {
    const body = tableSql("ledger_entries");
    expect(body).toContain(
      `"charged_cents" = "order_total_cents" + "service_fee_cents" AND "foode_fee_cents" <= "order_total_cents" AND "net_cents" = "order_total_cents" - "foode_fee_cents"`,
    );
    expect(body).toContain(`"expected_payout_date" > "release_date"`);
    expect(tableSql("payment_intents")).toContain(`("state" = 'paid') = ("paid_at" IS NOT NULL)`);
  });

  it("é só expand: colunas novas em orders com DEFAULT, sem DROP/RENAME/recriação", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b|__new_/i);
    expect(migration).toContain(
      "ALTER TABLE `orders` ADD `payment_status` text DEFAULT 'not_required' NOT NULL;",
    );
    expect(migration).toContain(
      "ALTER TABLE `orders` ADD `service_fee_cents` integer DEFAULT 0 NOT NULL;",
    );
  });

  it("Painel só enxerga Pedido pago ou sem pagamento online", () => {
    expect(ORDER_PAYMENT_STATUSES).toContain("awaiting");
    expect(PAINEL_VISIBLE_PAYMENT_SQL).toBe(`payment_status IN ('not_required', 'paid')`);
  });

  it("0007 vem logo depois da 0006", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf("0007_pix_abacatepay_ledger")).toBe(
      tags.indexOf("0006_conta_consumidor_cupons") + 1,
    );
  });
});
