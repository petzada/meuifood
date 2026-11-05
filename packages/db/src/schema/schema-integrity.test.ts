// Integridade do schema Drizzle sem banco: toda FK aponta para uma tabela do próprio schema,
// toda coluna de data tem o CHECK de UTC e todo CHECK/índice tem nome (as migrations e o
// `migrations:check` dependem disso). Vale para as tabelas que os próximos tickets somarem.
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import * as schema from "./index";
import { inList, utcCheck } from "./fundacao";

const tables: SQLiteTable[] = (Object.values(schema) as unknown[]).filter(
  (value): value is SQLiteTable => is(value, SQLiteTable),
);
const tableNames = new Set(tables.map((table) => getTableName(table)));

describe("schema do D1: integridade", () => {
  it("exporta as tabelas da fundação, auth, Cardápio e Ops", () => {
    for (const name of [
      "users",
      "stores",
      "store_memberships",
      "audit_events",
      "sessions",
      "menu_items",
      "store_profiles",
    ]) {
      expect(tableNames.has(name), name).toBe(true);
    }
  });

  for (const table of tables) {
    const config = getTableConfig(table);

    it(`${config.name}: FKs apontam para tabelas do schema, com colunas existentes`, () => {
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        const target = getTableName(ref.foreignTable);
        expect(tableNames.has(target), `${config.name} → ${target}`).toBe(true);
        const targetColumns = new Set(getTableConfig(ref.foreignTable).columns.map((c) => c.name));
        for (const column of ref.foreignColumns) expect(targetColumns.has(column.name)).toBe(true);
        expect(fk.getName()).toMatch(/_fk$/u);
      }
    });

    it(`${config.name}: CHECKs e índices nomeados; datas com CHECK de UTC`, () => {
      for (const check of config.checks) expect(check.name).toMatch(/^[a-z0-9_]+$/u);
      for (const index of config.indexes) expect(index.config.name).toMatch(/^[a-z0-9_]+$/u);
      const checkSql = config.checks.map((check) => JSON.stringify(check.value)).join(" ");
      for (const column of config.columns) {
        if (/_at$/u.test(column.name)) {
          expect(checkSql, `${config.name}.${column.name}`).toContain(
            `\\"${column.name}\\") IS \\"${column.name}\\"`,
          );
        }
      }
    });
  }

  it("utcCheck e inList geram o SQL esperado", () => {
    expect(JSON.stringify(utcCheck("created_at"))).toContain(
      `strftime('%Y-%m-%dT%H:%M:%fZ', \\"created_at\\") IS \\"created_at\\"`,
    );
    expect(inList("status", ["a", "b"])).toBe(`"status" IN ('a', 'b')`);
  });
});
