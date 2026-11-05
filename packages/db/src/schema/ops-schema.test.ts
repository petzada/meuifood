// Contrato do Ticket 29 sem banco: a migration 0002 cria cada tabela/coluna/índice do schema
// Ops e é só expand. A prova no D1 (aplicar do zero) e o drift completo (`migrations:check`)
// são do CI.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { paymentFees, planPriceTiers, providerCosts, storePlans, storeProfiles } from "./ops";

const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../migrations/0002_ops_lojas_planos_taxas.sql"),
  "utf8",
);

const tables: SQLiteTable[] = [
  storeProfiles,
  storePlans,
  planPriceTiers,
  paymentFees,
  providerCosts,
];

describe("migration 0002 × schema/ops.ts", () => {
  for (const table of tables) {
    const config = getTableConfig(table);

    it(`cria ${config.name} com todas as colunas e checks do schema`, () => {
      const body = migration.match(
        new RegExp(`CREATE TABLE \`${config.name}\` \\(([\\s\\S]*?)\\n\\);`),
      )?.[1];
      expect(body, config.name).toBeDefined();
      for (const column of config.columns) expect(body).toContain(`\`${column.name}\``);
      for (const check of config.checks) expect(body).toContain(`CONSTRAINT "${check.name}"`);
      const columnsInSql = [...(body ?? "").matchAll(/^\t`(\w+)` /gm)].map((m) => m[1]);
      expect(columnsInSql.sort()).toEqual(config.columns.map((c) => c.name).sort());
    });

    for (const index of config.indexes) {
      it(`cria o índice ${index.config.name}`, () => {
        expect(migration).toContain(`INDEX \`${index.config.name}\` ON \`${config.name}\``);
      });
    }
  }

  it("é só expand (sem DROP/RENAME/ALTER/recriação)", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b|\bALTER\b|__new_/i);
  });

  it("não usa GLOB/LIKE (limite de 50 bytes do D1)", () => {
    expect(migration).not.toMatch(/\b(GLOB|LIKE)\b/i);
  });

  it("não semeia taxa Foode (nasce vazia, decisão 61)", () => {
    expect(migration).not.toMatch(/INSERT[^;]*`payment_fees`/i);
  });
});
