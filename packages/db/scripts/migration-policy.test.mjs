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

  it.each([
    ['drop schema public cascade;', "DROP não autorizado"],
    ['drop type "membership_role" cascade;', "DROP não autorizado"],
    ['drop owned by foode_business;', "DROP não autorizado"],
    [
      'alter table "categories" drop constraint "categories_name_key";',
      "DROP não autorizado",
    ],
  ])("falha fechado para outras remoções: %s", (sql, command) => {
    expect(() =>
      validateMigrationSql("20260728185000_invalid_drop", sql),
    ).toThrow(`comando destrutivo ${command}`);
  });

  it.each([
    [
      'alter table "orders" disable row level security;',
      "DISABLE ROW LEVEL SECURITY",
    ],
    [
      'alter table "orders" no force row level security;',
      "NO FORCE ROW LEVEL SECURITY",
    ],
    ["alter role foode_business bypassrls;", "BYPASSRLS"],
    ["alter role foode_business superuser;", "SUPERUSER"],
  ])("rejeita bypass de isolamento: %s", (sql, command) => {
    expect(() =>
      validateMigrationSql("20260728186000_unsafe_rls", sql),
    ).toThrow(`comando destrutivo ${command}`);
  });

  it.each(["begin;", "start transaction;", "commit;", "rollback;"])(
    "rejeita controle que pode escapar do rollback: %s",
    (sql) => {
      expect(() =>
        validateMigrationSql("20260728187000_unsafe_transaction", sql),
      ).toThrow("controle transacional não autorizado");
    },
  );

  it.each([
    "vacuum stores;",
    "alter system set statement_timeout = 0;",
    "create database shadow;",
    "create function unsafe() returns void language sql as $$ delete from stores $$;",
  ])("rejeita estrutura fora da allowlist: %s", (sql) => {
    expect(() =>
      validateMigrationSql("20260728188000_unknown_structure", sql),
    ).toThrow(/estrutura SQL não autorizada|comando destrutivo DELETE/u);
  });

  it("rejeita SQL dinâmico que ocultaria uma operação destrutiva", () => {
    expect(() =>
      validateMigrationSql(
        "20260728189000_dynamic_sql",
        "do $$ begin execute 'drop table stores'; end $$;",
      ),
    ).toThrow("SQL dinâmico EXECUTE");
  });

  it.each([
    "do $$ begin perform public.purge_business_data(); end $$;",
    "do $$ begin call public.purge_business_data(); end $$;",
    "do $$ begin update stores set name = 'apagada'; end $$;",
    "do 'begin perform public.purge_business_data(); end';",
  ])("rejeita efeitos indiretos em bloco DO: %s", (sql) => {
    expect(() =>
      validateMigrationSql("20260728189200_unsafe_do", sql),
    ).toThrow("bloco DO não autorizado");
  });

  it("aceita somente o bloco DO canônico que cria a role sem privilégios", () => {
    expect(() =>
      validateMigrationSql(
        "20260728189300_business_role",
        `
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_roles WHERE rolname = 'foode_business'
            ) THEN
              CREATE ROLE foode_business
                NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
                NOINHERIT NOBYPASSRLS;
            END IF;
          END
          $$;
        `,
      ),
    ).not.toThrow();
  });

  it("rejeita conceder uma role privilegiada à role de negócio", () => {
    expect(() =>
      validateMigrationSql(
        "20260728189500_privileged_membership",
        "grant postgres to foode_business;",
      ),
    ).toThrow("GRANT não autorizado");
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

  it.each([
    [
      "ALTER COLUMN TYPE",
      'alter table "orders" alter column "total" type integer using "total"::integer;',
    ],
    [
      "ALTER COLUMN TYPE",
      'alter table "orders" alter "total" set data type numeric(10,2);',
    ],
    ["RENAME", 'alter table "orders" rename to "pedidos";'],
    ["RENAME", 'alter table "orders" rename column "total" to "amount";'],
  ])("rejeita perda silenciosa de dado ou de referência: %s", (command, sql) => {
    expect(() =>
      validateMigrationSql("20260728191000_silent_loss", sql),
    ).toThrow(`comando destrutivo ${command}`);
  });

  it.each([
    'create index concurrently "orders_store_id_idx" on "orders" ("store_id");',
    'drop index concurrently "orders_store_id_idx";',
  ])("rejeita cedo o que o preflight transacional não suporta: %s", (sql) => {
    expect(() =>
      validateMigrationSql("20260728192000_concurrently", sql),
    ).toThrow("CONCURRENTLY, que não pode rodar dentro do preflight transacional");
  });

  it("rejeita migration vazia", () => {
    expect(() =>
      validateMigrationSql("20260728200000_empty", " -- apenas comentário\n"),
    ).toThrow("não contém SQL executável");
  });
});
