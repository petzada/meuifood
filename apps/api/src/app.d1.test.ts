// Rotas do Worker no workerd com D1 (só no CI). Prova a fronteira de exposição: o fetch
// público só atende /health, Storefront e webhooks; o Painel só existe como RPC.
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { seedTwoStores, type TwoStoresFixture } from "@foode/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

let fx: TwoStoresFixture;

function get(path: string) {
  return exports.default.fetch(new Request(`https://api.foode.test${path}`));
}

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
});

describe("fetch público", () => {
  it("/health responde ok com o D1", async () => {
    const response = await get("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "api",
      database: "ok",
    });
  });

  it("Storefront devolve só campos públicos de Loja active", async () => {
    const response = await get(`/storefront/lojas/${fx.storeA.slug}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ slug: fx.storeA.slug, name: fx.storeA.name });
  });

  it("Storefront não revela Loja inexistente nem Slug malformado", async () => {
    expect((await get("/storefront/lojas/nao-existe")).status).toBe(404);
    expect((await get("/storefront/lojas/..%2Fadmin")).status).toBe(404);
  });

  it("operações do Painel e caminhos fora da fronteira respondem 404", async () => {
    for (const path of ["/painel/health", "/PainelApi/health", "/health/../painel", "/ops/lojas"]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});

describe("entrypoint PainelApi (RPC)", () => {
  it("health pelo binding", async () => {
    await expect(exports.PainelApi.health()).resolves.toEqual({
      status: "ok",
      service: "api",
      database: "ok",
    });
  });
});
