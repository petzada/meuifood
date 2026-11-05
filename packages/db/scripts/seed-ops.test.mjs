import { describe, expect, it } from "vitest";

import { buildSeedSql, parseOpsEmails } from "./seed-ops.mjs";

describe("parseOpsEmails", () => {
  it("normaliza, separa por vírgula/espaço/ponto e vírgula e remove repetidos", () => {
    expect(parseOpsEmails(" Ops@Foode.com.br, b@x.io;ops@foode.com.br\nc@y.dev ")).toEqual([
      "ops@foode.com.br",
      "b@x.io",
      "c@y.dev",
    ]);
  });

  it("vazio vira lista vazia", () => {
    expect(parseOpsEmails(undefined)).toEqual([]);
    expect(parseOpsEmails("  ")).toEqual([]);
  });

  it("recusa e-mail inválido (inclusive com aspas) sem ecoar o valor", () => {
    expect(() => parseOpsEmails("o'reilly@a.com")).toThrow(/1 e-mail\(s\) inválido/);
    expect(() => parseOpsEmails("sem-arroba")).toThrow(/inválido/);
  });
});

describe("buildSeedSql", () => {
  it("gera upsert idempotente só com papel foode_ops e sem senha", () => {
    const sql = buildSeedSql(["ops@foode.com.br"], () => "id-1");
    expect(sql).toContain(
      "INSERT INTO users (id, email, name, platform_role) VALUES ('id-1', 'ops@foode.com.br', '', 'foode_ops')",
    );
    expect(sql).toContain("ON CONFLICT (email) DO UPDATE SET platform_role = 'foode_ops'");
    expect(sql).not.toMatch(/password|senha|stores|store_memberships/i);
  });

  it("sem e-mails não gera SQL", () => {
    expect(buildSeedSql([])).toBe("");
  });
});
