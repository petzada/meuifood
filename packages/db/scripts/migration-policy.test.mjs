import { describe, expect, it } from "vitest";

import { validateMigrationSql } from "./migration-policy.mjs";

describe("política de migrations de produção", () => {
  it("aceita mudanças aditivas e remoção de índice", () => {
    expect(() =>
      validateMigrationSql(
        "20260728170000_membership_cardinality",
        `
          create table "categories" ("id" uuid primary key);
          alter table "categories" add column "name" text;
          drop index "legacy_categories_name_idx";
        `,
      ),
    ).not.toThrow();
  });

  it("não confunde remoção de constraint com remoção de coluna", () => {
    expect(() =>
      validateMigrationSql(
        "20260728175000_replace_constraint",
        'alter table "categories" drop constraint "categories_name_key";',
      ),
    ).not.toThrow();
  });

  it.each([
    ["DROP TABLE", 'drop table "orders";'],
    ["DROP COLUMN", 'alter table "orders" drop column "total";'],
    ["DELETE", 'delete from "orders";'],
    ["TRUNCATE", 'truncate table "orders";'],
  ])("rejeita %s antes do acesso à produção", (command, sql) => {
    expect(() =>
      validateMigrationSql("20260728180000_invalid", sql),
    ).toThrow(`comando destrutivo ${command}`);
  });

  it("ignora palavras proibidas em comentários e literais", () => {
    expect(() =>
      validateMigrationSql(
        "20260728190000_documented",
        `
          -- DELETE FROM orders é proibido.
          /* DROP TABLE orders também. */
          create table "migration_notes" (
            "note" text default 'TRUNCATE TABLE orders'
          );
        `,
      ),
    ).not.toThrow();
  });

  it("rejeita migration vazia", () => {
    expect(() =>
      validateMigrationSql("20260728200000_empty", " -- apenas comentário\n"),
    ).toThrow("não contém SQL executável");
  });
});
