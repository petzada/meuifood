import { describe, expect, it } from "vitest";

import { isContract, lintMigration } from "./lint-migrations.mjs";

describe("lint-migrations", () => {
  it("expand passa", () => {
    expect(
      lintMigration(
        "0001_cardapio.sql",
        "CREATE TABLE `x` (`id` text PRIMARY KEY NOT NULL);\nALTER TABLE `stores` ADD `phone` text;",
      ),
    ).toEqual([]);
  });

  it("contract sem marcador falha; com marcador passa e é detectado", () => {
    const sql = "ALTER TABLE `stores` DROP COLUMN `phone`;";
    expect(lintMigration("0002_drop.sql", sql).join()).toMatch(/contract/);
    const marked = `-- contract: phone saiu do código no Ticket 99\n${sql}`;
    expect(lintMigration("0002_drop.sql", marked)).toEqual([]);
    expect(isContract(marked)).toBe(true);
    expect(isContract(sql)).toBe(false);
  });

  it("recriação de tabela do drizzle-kit conta como contract", () => {
    const sql =
      "CREATE TABLE `__new_stores` (`id` text);\nINSERT INTO `__new_stores` SELECT * FROM `stores`;";
    expect(lintMigration("0003_tipo.sql", sql).join()).toMatch(/__new_/);
  });

  it("recusa nome fora do padrão, transação explícita, PRAGMA foreign_keys e NOT NULL sem default", () => {
    expect(lintMigration("cardapio.sql", "SELECT 1;").join()).toMatch(/nome/);
    expect(lintMigration("0004_x.sql", "BEGIN;\nSELECT 1;\nCOMMIT;").join()).toMatch(/BEGIN/);
    expect(lintMigration("0004_x.sql", "PRAGMA foreign_keys=OFF;").join()).toMatch(
      /defer_foreign_keys/,
    );
    expect(
      lintMigration("0004_x.sql", "ALTER TABLE `stores` ADD COLUMN `cnpj` text NOT NULL;").join(),
    ).toMatch(/DEFAULT/);
  });

  it("a migration de fundação passa", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(
      new URL("../packages/db/migrations/0000_fundacao.sql", import.meta.url),
      "utf8",
    );
    expect(lintMigration("0000_fundacao.sql", sql)).toEqual([]);
  });
});
