import { hashPassword, verifyPassword } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

import {
  buildTestAccountsSql,
  PILOT_STORE,
  quote,
  TEST_ACCOUNTS,
  validatePassword,
} from "./seed-test-accounts.mjs";

const HASH = `${"a".repeat(32)}:${"b".repeat(128)}`;
const hashes = Object.fromEntries(TEST_ACCOUNTS.map((account) => [account.email, HASH]));

function sequentialIds() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

describe("seed das contas de teste", () => {
  it("o hash do better-auth tem o formato que o SQL aceita e confere com a senha", async () => {
    const hash = await hashPassword("senha-de-teste-123");
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/u);
    await expect(verifyPassword({ hash, password: "senha-de-teste-123" })).resolves.toBe(true);
    expect(() => buildTestAccountsSql({ ...hashes, "lojista@teste.com": hash })).not.toThrow();
  });

  it("gera SQL idempotente: upserts, Loja condicionada ao Slug livre e auditoria", () => {
    const sql = buildTestAccountsSql(hashes, sequentialIds());
    expect(sql).toContain("ON CONFLICT (email) DO UPDATE SET email_verified = 1");
    expect(sql).toContain("'credential'");
    expect(sql).toContain("u.id, u.id, 'credential'");
    expect(sql).toContain(
      "ON CONFLICT (provider_id, account_id) DO UPDATE SET password = excluded.password",
    );
    expect(sql).toContain(
      `WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = '${PILOT_STORE.slug}')`,
    );
    expect(sql).toContain("store_slug_history");
    expect(sql).toContain("'onboarding'");
    expect(sql).toContain("'store.created'");
    expect(sql.match(/ON CONFLICT \(store_id, user_id\) DO NOTHING/gu)).toHaveLength(2);
    expect(sql).toContain("'owner'");
    expect(sql).toContain("'operator'");
    expect(sql).not.toMatch(/BEGIN|COMMIT|PRAGMA/u);
  });

  it("recusa hash fora do formato e senha curta, sem ecoar valores", () => {
    expect(() => buildTestAccountsSql({ ...hashes, "operador@teste.com": "texto-claro" })).toThrow(
      /hash de senha inválido para operador@teste.com/u,
    );
    expect(() => validatePassword(undefined)).toThrow(/SEED_TEST_PASSWORD/u);
    expect(() => validatePassword("curta")).toThrow(/SEED_TEST_PASSWORD/u);
    expect(() => validatePassword("x".repeat(129))).toThrow(/SEED_TEST_PASSWORD/u);
    expect(validatePassword("senha-boa-123")).toBe("senha-boa-123");
  });

  it("escapa aspas simples", () => {
    expect(quote("o'reilly")).toBe("'o''reilly'");
  });
});
