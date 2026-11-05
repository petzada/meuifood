// Contrato do Ticket 13 sem banco: a migration 0006 cria cada tabela/coluna/índice/CHECK do schema
// da conta do Consumidor e dos Cupons, é só expand e não guarda telefone/código em claro no login.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { couponRedemptions, coupons, storeWelcomeCoupons } from "./coupons";
import { customerAccounts, customerLoginCodes, customerSessions } from "./customers";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const migration = readFileSync(join(migrationsDir, "0006_conta_consumidor_cupons.sql"), "utf8");
const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

const tables: SQLiteTable[] = [
  customerAccounts,
  customerLoginCodes,
  customerSessions,
  coupons,
  storeWelcomeCoupons,
  couponRedemptions,
];

function tableSql(name: string): string {
  return migration.match(new RegExp(`CREATE TABLE \`${name}\` \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

describe("migration 0006 × schema/customers.ts + schema/coupons.ts", () => {
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

  it("um telefone = uma conta; um CPF = uma conta; código único por Loja", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `customer_accounts_phone_unique` ON `customer_accounts` (`phone_e164`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `customer_accounts_cpf_unique` ON `customer_accounts` (`cpf`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `coupons_store_code_unique` ON `coupons` (`store_id`,`code`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `coupon_redemptions_welcome_unique` ON `coupon_redemptions` (`store_id`,`customer_account_id`) WHERE \"source\" = 'welcome'",
    );
  });

  it("código de login sem telefone nem código em claro; até 5 tentativas", () => {
    const columns = [...tableSql("customer_login_codes").matchAll(/^\t`(\w+)` /gm)].map(
      (m) => m[1],
    );
    expect(columns).not.toContain("phone_e164");
    expect(columns).not.toContain("code");
    expect(tableSql("customer_login_codes")).toContain(`"attempts" BETWEEN 0 AND 5`);
  });

  it("uso do Cupom amarrado ao Pedido e ao Cupom da MESMA Loja; limite no banco", () => {
    const body = tableSql("coupon_redemptions");
    expect(body).toContain(
      "FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`)",
    );
    expect(body).toContain(
      "FOREIGN KEY (`store_id`,`coupon_id`) REFERENCES `coupons`(`store_id`,`id`)",
    );
    expect(tableSql("coupons")).toContain(
      `"used_count" >= 0 AND ("usage_limit" IS NULL OR "used_count" <= "usage_limit")`,
    );
  });

  it("é só expand: ADD COLUMN nullable em orders, sem DROP/RENAME/recriação", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b|__new_/i);
    expect(migration).toContain(
      "ALTER TABLE `orders` ADD `customer_account_id` text REFERENCES customer_accounts(id);",
    );
  });

  it("padrões GLOB curtos (limite de 50 bytes do D1)", () => {
    for (const match of migration.matchAll(/GLOB '([^']*)'/g)) {
      expect(new TextEncoder().encode(match[1]).length).toBeLessThanOrEqual(50);
    }
  });

  it("0006 vem logo depois da 0005", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.indexOf("0006_conta_consumidor_cupons")).toBe(
      tags.indexOf("0005_onboarding_vitrine_funil") + 1,
    );
  });
});
