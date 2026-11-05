// Ticket 28 em @foode/db no workerd (só no CI): funil agregado sem dado pessoal, isolamento das
// escritas do Dono entre Lojas, Operador recusado na segunda barreira e CHECKs da migration 0005.
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { type StoreContext } from "./context";
import { createFoodeDb, type FoodeDb } from "./index";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "./testing";

let db: FoodeDb;
let fx: TwoStoresFixture;

async function contextOf(userId: string, storeId: string): Promise<StoreContext> {
  const context = await db.access.storeContext({ userId, storeId });
  if (!context) throw new Error("membership esperada na fixture");
  return context;
}

beforeEach(async () => {
  db = createFoodeDb(env.DB);
  fx = await seedTwoStores(env.DB);
  const ops = await db.access.opsContext(fx.ops.id);
  await db.ops(ops!).updateStore(fx.storeA.id, storeProfileFixture());
});

describe("funil agregado", () => {
  it("UPSERT por Loja/dia/evento, só colunas agregadas, Loja inativa não conta", async () => {
    expect(await db.storefront.recordFunnelEvent(fx.storeA.slug, "visit", "2026-11-05")).toBe(true);
    expect(await db.storefront.recordFunnelEvent(fx.storeA.slug, "visit", "2026-11-05")).toBe(true);
    expect(await db.storefront.recordFunnelEvent(fx.storeA.slug, "order", "2026-11-06")).toBe(true);
    expect(await db.storefront.recordFunnelEvent(fx.storeB.slug, "visit", "2026-11-05")).toBe(true);
    expect(await db.storefront.recordFunnelEvent("nao-existe", "visit", "2026-11-05")).toBe(false);

    const rows = await env.DB.prepare(
      `SELECT * FROM store_funnel_daily WHERE store_id = ? ORDER BY day, event`,
    )
      .bind(fx.storeA.id)
      .all<Record<string, unknown>>();
    expect(rows.results.map((row) => Object.keys(row).sort())).toEqual([
      ["count", "day", "event", "store_id", "updated_at"],
      ["count", "day", "event", "store_id", "updated_at"],
    ]);
    expect(rows.results.map(({ day, event, count }) => ({ day, event, count }))).toEqual([
      { day: "2026-11-05", event: "visit", count: 2 },
      { day: "2026-11-06", event: "order", count: 1 },
    ]);

    const ownerA = db.store(await contextOf(fx.ownerA.id, fx.storeA.id)).onboarding();
    expect(await ownerA.funnelCounters("2026-11-05", "2026-11-05")).toEqual([
      { day: "2026-11-05", event: "visit", count: 2 },
    ]);
  });

  it("CHECK recusa dia inválido", async () => {
    await expect(
      db.storefront.recordFunnelEvent(fx.storeA.slug, "visit", "2026-02-30"),
    ).rejects.toThrow();
  });
});

describe("escritas do Dono", () => {
  it("Operador é recusado em @foode/db mesmo com contexto válido", async () => {
    const operator = db.store(await contextOf(fx.operatorA.id, fx.storeA.id)).onboarding();
    await expect(
      operator.setPixels({ metaPixelId: null, googleTagId: null }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(operator.setSlug("loja-nova-op")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("vitrine e perfil ficam na Loja do contexto", async () => {
    const ownerA = db.store(await contextOf(fx.ownerA.id, fx.storeA.id)).onboarding();
    const ownerB = db.store(await contextOf(fx.ownerB.id, fx.storeB.id)).onboarding();
    await ownerA.setShowcase({ description: "Só da A" });
    await ownerA.answerProfile({
      cuisine: "pizza",
      cuisineOther: null,
      goal: "sell_more",
      goalOther: null,
    });
    expect((await ownerA.settings()).description).toBe("Só da A");
    expect((await ownerB.settings()).description).toBeNull();
    expect(await ownerB.ownerProfile()).toBeNull();
    expect(await db.storefront.showcaseOf(fx.storeB.id)).toBeNull();
    // Contato sem cadastro do Ops (Loja B) = conflict.
    await expect(ownerB.setContact({ whatsapp: "5511912345678" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("CHECK: descrição > 160 e Pixel fora do formato são recusados no banco", async () => {
    const ownerA = db.store(await contextOf(fx.ownerA.id, fx.storeA.id)).onboarding();
    await expect(ownerA.setShowcase({ description: "a".repeat(161) })).rejects.toThrow();
    await expect(ownerA.setPixels({ metaPixelId: "123", googleTagId: null })).rejects.toThrow();
  });
});

describe("histórico de Link personalizado (decisão 69)", () => {
  it("troca na mesma escrita; reserva entre Lojas; voltar ao antigo", async () => {
    const ownerA = db.store(await contextOf(fx.ownerA.id, fx.storeA.id)).onboarding();
    const ownerB = db.store(await contextOf(fx.ownerB.id, fx.storeB.id)).onboarding();
    const original = fx.storeA.slug;
    const next = `novo-${crypto.randomUUID().slice(0, 8)}`;
    await ownerA.setSlug(next);
    expect(await db.storefront.currentSlugForHistorical(original)).toBe(next);
    expect(await db.storefront.currentSlugForHistorical(next)).toBeNull();
    expect(await ownerB.slugStatus(original)).toBe("taken");
    expect(await ownerA.slugStatus(original)).toBe("free");
    await expect(ownerB.setSlug(original)).rejects.toMatchObject({ code: "slug_unavailable" });
    expect((await ownerB.settings()).slug).toBe(fx.storeB.slug);
    expect(await ownerB.slugHistory()).toEqual([]);

    await ownerA.setSlug(original);
    expect((await ownerA.slugHistory()).map((row) => row.slug)).toEqual([next]);
    expect(await db.storefront.currentSlugForHistorical(original)).toBeNull();
    expect(await db.storefront.currentSlugForHistorical(next)).toBe(original);
  });

  it("confirmar o mesmo link não grava histórico", async () => {
    const ownerA = db.store(await contextOf(fx.ownerA.id, fx.storeA.id)).onboarding();
    await ownerA.setSlug(fx.storeA.slug);
    expect(await ownerA.slugHistory()).toEqual([]);
  });
});
