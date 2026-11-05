// Contrato do Ticket 22 sem banco: o schema Drizzle cobre o que o Better Auth grava com as
// opções do Foode, e a migration 0001 cria cada tabela/coluna desse schema. A prova no D1
// (aplicar do zero) é do CI; a divergência schema × SQL também (`migrations:check`).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getAuthTables } from "better-auth/db";
import { type Column, getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { AUTH_SCHEMA_OPTIONS, authSchema } from "./auth";

const expected = getAuthTables({ ...AUTH_SCHEMA_OPTIONS, emailAndPassword: { enabled: true } });

const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../migrations/0001_auth_better_auth.sql"),
  "utf8",
);

describe("authSchema × Better Auth", () => {
  it("tem um model para cada tabela que o Better Auth grava", () => {
    expect(Object.keys(authSchema).sort()).toEqual(Object.keys(expected).sort());
  });

  for (const [model, table] of Object.entries(expected)) {
    it(`${model}: cada campo do Better Auth existe com a mesma obrigatoriedade`, () => {
      const columns: Record<string, Column> = getTableColumns(
        authSchema[model as keyof typeof authSchema],
      );
      for (const [key, field] of Object.entries(table.fields)) {
        const name = field.fieldName ?? key;
        const column = columns[name];
        expect(column, `${model}.${name}`).toBeDefined();
        if (field.required === false) expect(column?.notNull, `${model}.${name}`).toBe(false);
      }
    });

    it(`${model}: coluna fora do Better Auth aceita insert sem ela`, () => {
      const known = new Set(["id", ...Object.values(table.fields).map((f) => f.fieldName)]);
      const columns = getTableColumns(authSchema[model as keyof typeof authSchema]);
      for (const [name, column] of Object.entries(columns)) {
        if (known.has(name)) continue;
        expect(!column.notNull || column.hasDefault, `${model}.${name}`).toBe(true);
      }
    });
  }
});

describe("migration 0001", () => {
  const authTables = [
    authSchema.session,
    authSchema.account,
    authSchema.verification,
    authSchema.rateLimit,
  ];

  for (const table of authTables) {
    const config = getTableConfig(table);
    it(`cria ${config.name} com todas as colunas do schema`, () => {
      const body = migration.match(
        new RegExp(`CREATE TABLE \`${config.name}\` \\(([\\s\\S]*?)\\n\\);`),
      );
      expect(body, config.name).not.toBeNull();
      for (const column of config.columns) {
        expect(body?.[1]).toContain(`\`${column.name}\``);
      }
    });
  }

  it("é só expand (sem DROP/RENAME/recriação)", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b|__new_/i);
  });

  it("não usa GLOB/LIKE em CHECK (limite de 50 bytes do D1)", () => {
    expect(migration).not.toMatch(/\b(GLOB|LIKE)\b/i);
  });
});
