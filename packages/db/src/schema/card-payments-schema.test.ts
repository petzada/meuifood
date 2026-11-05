// Contrato do Ticket 27 sem banco: a migration 0009 cria as tabelas do Cartão e da retenção do
// Ledger, é só expand (tabelas + índice novo, nada recriado) e amarra tudo ao Pedido da MESMA
// Loja. Uma tentativa viva por Pedido; idempotência por (Loja, Pedido, attempt_key).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { cardPayments, ledgerRetentions } from "./card-payments";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const migration = readFileSync(join(migrationsDir, "0009_cartao_efi_abacatepay.sql"), "utf8");
const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

const tables: SQLiteTable[] = [cardPayments, ledgerRetentions];

function tableSql(name: string): string {
  return migration.match(new RegExp(`CREATE TABLE \`${name}\` \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

describe("migration 0009 × schema/card-payments.ts", () => {
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
      expect(body).toContain(
        "FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`)",
      );
    });
  }

  it("idempotência da tentativa e uma tentativa viva por Pedido", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `card_payments_attempt_unique` ON `card_payments` (`store_id`,`order_id`,`attempt_key`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `payment_intents_credit_active_unique` ON `payment_intents` (`store_id`,`order_id`) WHERE \"method\" = 'credit' AND \"state\" IN ('creating', 'pending', 'paid')",
    );
  });

  it("nada de dado do cartão ou do pagador no banco", () => {
    const columns = getTableConfig(cardPayments).columns.map((c) => c.name);
    for (const forbidden of [/number/, /cvv/, /expir/, /token$/, /cpf/, /email/, /birth/]) {
      expect(
        columns.filter((name) => forbidden.test(name) && name !== "efi_notification_token"),
      ).toEqual([]);
    }
  });

  it("é só expand: sem DROP/RENAME/recriação nem ALTER", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b|__new_|\bALTER\s+TABLE\b/i);
  });

  it("0009 vem logo depois da 0008", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf("0009_cartao_efi_abacatepay")).toBe(tags.indexOf("0008_leads_rate_km") + 1);
  });
});
