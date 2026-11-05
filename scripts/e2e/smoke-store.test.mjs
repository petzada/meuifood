import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildCleanupSql,
  buildSeedSql,
  buildState,
  randomSessionToken,
  SESSION_COOKIE_NAME,
  signSessionCookie,
  SMOKE_STORE,
  SMOKE_USERS,
} from "./smoke-store.mjs";

const TOKENS = { operator: "A".repeat(32), ops: "b".repeat(32) };
const EXPIRES = "2026-11-05T12:45:00.000Z";

/** O better-call que a api usa de fato (resolvido a partir do better-auth do apps/api). */
async function betterCall() {
  const fromApi = createRequire(new URL("../../apps/api/package.json", import.meta.url));
  const fromAuth = createRequire(fromApi.resolve("better-auth"));
  return import(pathToFileURL(fromAuth.resolve("better-call")).href);
}

describe("signSessionCookie", () => {
  it("gera o mesmo valor que o better-call grava no Set-Cookie", async () => {
    const { serializeSignedCookie } = await betterCall();
    const token = randomSessionToken();
    const header = await serializeSignedCookie(SESSION_COOKIE_NAME, token, "segredo-de-teste");
    expect(header.split(";")[0]).toBe(
      `${SESSION_COOKIE_NAME}=${signSessionCookie(token, "segredo-de-teste")}`,
    );
  });

  it("recusa token fora do formato e segredo vazio", () => {
    expect(() => signSessionCookie("curto", "s")).toThrow(/token/u);
    expect(() => signSessionCookie(TOKENS.ops, " ")).toThrow(/BETTER_AUTH_SECRET/u);
  });
});

describe("randomSessionToken", () => {
  it("32 alfanuméricos, diferentes a cada chamada", () => {
    const a = randomSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/u);
    expect(randomSessionToken()).not.toBe(a);
  });
});

describe("buildSeedSql", () => {
  const sql = buildSeedSql({ sessions: TOKENS, expiresAt: EXPIRES, newId: () => "id-fixo" });

  it("Loja fixa ativa, só retirada, aberta o dia todo e sem Plano", () => {
    expect(sql).toContain(`'${SMOKE_STORE.id}', '${SMOKE_STORE.slug}'`);
    expect(sql).toMatch(/pickup_enabled = 1, delivery_mode = NULL/u);
    expect(sql.match(/'00:00', '23:59'/gu)).toHaveLength(7);
    expect(sql).not.toMatch(/store_plans|payment_fees/u);
  });

  it("usuários sintéticos sem senha; Ops promovido e sessões com prazo", () => {
    expect(sql).toContain(`DELETE FROM accounts WHERE user_id IN`);
    expect(sql).not.toMatch(/INSERT INTO accounts/u);
    expect(sql).toMatch(/smoke-ops@foode\.invalid'.*'foode_ops'/u);
    expect(sql).toContain(`'${TOKENS.operator}', '${EXPIRES}'`);
    expect(sql).toContain(`'${TOKENS.ops}', '${EXPIRES}'`);
  });

  it("limpa Pedidos e sessões anteriores antes de semear (fila nasce vazia)", () => {
    expect(sql.indexOf("DELETE FROM orders")).toBeLessThan(sql.indexOf("INSERT INTO stores"));
    expect(sql.indexOf("DELETE FROM sessions")).toBeLessThan(sql.indexOf("INSERT INTO sessions"));
  });

  it("toda escrita de Pedido/evento fica restrita à Loja de smoke", () => {
    for (const line of sql
      .split("\n")
      .filter((l) => /^DELETE FROM (order|phone|coupon|store_funnel|audit)/u.test(l))) {
      expect(line).toContain(`store_id = '${SMOKE_STORE.id}'`);
    }
  });

  it("recusa token inválido e data fora do ISO com milissegundos", () => {
    expect(() => buildSeedSql({ sessions: { ...TOKENS, ops: "x" }, expiresAt: EXPIRES })).toThrow();
    expect(() => buildSeedSql({ sessions: TOKENS, expiresAt: "2026-11-05" })).toThrow();
  });
});

describe("buildCleanupSql", () => {
  it("apaga sessões e Pedidos de smoke e tira o papel foode_ops", () => {
    const sql = buildCleanupSql();
    expect(sql).toContain(`DELETE FROM orders WHERE store_id = '${SMOKE_STORE.id}';`);
    expect(sql).toContain("DELETE FROM sessions WHERE user_id IN");
    expect(sql).toMatch(
      new RegExp(`SET platform_role = NULL[^;]*email = '${SMOKE_USERS.ops.email}'`, "u"),
    );
  });
});

describe("buildState", () => {
  it("leva só Loja, Cardápio e cookies assinados (nunca o segredo)", () => {
    const state = buildState({ sessions: TOKENS, secret: "segredo-de-teste" });
    expect(state.store.slug).toBe(SMOKE_STORE.slug);
    expect(state.cookies.operator).toBe(signSessionCookie(TOKENS.operator, "segredo-de-teste"));
    expect(JSON.stringify(state)).not.toContain("segredo-de-teste");
  });
});
