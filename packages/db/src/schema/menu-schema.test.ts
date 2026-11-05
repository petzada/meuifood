// Contrato do Ticket 23 sem banco: a migration 0003 cria cada tabela/coluna/índice/FK do schema
// do Cardápio e é só expand; os limites do D1 x @foode/shared ficam em apps/api/src/menu-contract.test.ts. A prova no D1 (aplicar do
// zero, FKs compostas, cascade) e o drift completo (`migrations:check`) são do CI.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import {
  menuAdditionals,
  menuCategories,
  menuComplementGroups,
  menuComplementOptions,
  menuItems,
} from "./menu";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const migration = readFileSync(join(migrationsDir, "0003_cardapio.sql"), "utf8");
const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

const tables: SQLiteTable[] = [
  menuCategories,
  menuItems,
  menuComplementGroups,
  menuComplementOptions,
  menuAdditionals,
];

describe("migration 0003 × schema/menu.ts", () => {
  for (const table of tables) {
    const config = getTableConfig(table);

    it(`cria ${config.name} com todas as colunas e checks do schema`, () => {
      const body = migration.match(
        new RegExp(`CREATE TABLE \`${config.name}\` \\(([\\s\\S]*?)\\n\\);`),
      )?.[1];
      expect(body, config.name).toBeDefined();
      for (const check of config.checks) expect(body).toContain(`CONSTRAINT "${check.name}"`);
      const columnsInSql = [...(body ?? "").matchAll(/^\t`(\w+)` /gm)].map((m) => m[1]);
      expect(columnsInSql.sort()).toEqual(config.columns.map((c) => c.name).sort());
      expect(body, "store_id em toda tabela").toContain("`store_id` text NOT NULL");
    });

    for (const index of config.indexes) {
      it(`cria o índice ${index.config.name}`, () => {
        expect(migration).toContain(`INDEX \`${index.config.name}\` ON \`${config.name}\``);
      });
    }
  }

  it("filhos apontam para o pai pela FK composta (store_id, id): sem vínculo entre Lojas", () => {
    expect(migration).toContain(
      "FOREIGN KEY (`store_id`,`category_id`) REFERENCES `menu_categories`(`store_id`,`id`)",
    );
    for (const child of ["menu_complement_groups", "menu_additionals"]) {
      expect(
        migration.match(new RegExp(`CREATE TABLE \`${child}\`[\\s\\S]*?\\n\\);`))?.[0],
      ).toContain(
        "FOREIGN KEY (`store_id`,`item_id`) REFERENCES `menu_items`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade",
      );
    }
    expect(migration).toContain(
      "FOREIGN KEY (`store_id`,`group_id`) REFERENCES `menu_complement_groups`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade",
    );
  });

  it("opção de Complemento tem preço com padrão 0 (P-1.1) e item tem destaque (P-5.5)", () => {
    expect(migration).toContain("`price_cents` integer DEFAULT 0 NOT NULL");
    expect(migration).toContain("`featured` integer DEFAULT false NOT NULL");
  });

  it("é só expand (sem DROP/RENAME/ALTER/recriação)", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b|\bALTER\b|__new_/i);
  });

  it("não usa GLOB/LIKE (limite de 50 bytes do D1)", () => {
    expect(migration).not.toMatch(/\b(GLOB|LIKE)\b/i);
  });

  it("datas com utcCheck em todas as tabelas", () => {
    const utcChecks = migration.match(/strftime\('%Y-%m-%dT%H:%M:%fZ', "(created|updated)_at"\)/g);
    expect(utcChecks).toHaveLength(tables.length * 2);
  });

  it("0003 é o número reservado ao Ticket 23 (0002 = Ticket 29, entra antes no merge)", () => {
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags).toContain("0003_cardapio");
    expect(journal.entries.find((entry) => entry.tag === "0003_cardapio")?.idx).toBe(3);
  });
});
