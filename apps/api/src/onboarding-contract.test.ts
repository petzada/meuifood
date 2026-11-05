// Contrato do Ticket 28 sem banco: constantes D1 = @foode/shared/onboarding; a migration 0005 é
// expand-only, sem GLOB/LIKE longo e tem os CHECKs dos limites; as RPCs do Dono validam a entrada
// e só passam com StoreContext de Dono (Operador e Ops = `forbidden`); a vitrine pública não leva
// dado interno. Regras com D1 ficam em onboarding.d1.test.ts (CI).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type FoodeDb,
  FoodeDbError,
  FUNNEL_EVENTS as DB_FUNNEL_EVENTS,
  PROFILE_OTHER_MAX as DB_PROFILE_OTHER_MAX,
  STORE_CUISINES as DB_STORE_CUISINES,
  STORE_DESCRIPTION_MAX as DB_STORE_DESCRIPTION_MAX,
  STORE_GOALS as DB_STORE_GOALS,
} from "@foode/db";
import {
  EMPTY_STOREFRONT_SHOWCASE,
  FUNNEL_EVENTS,
  PROFILE_OTHER_MAX,
  STORE_CUISINES,
  STORE_DESCRIPTION_MAX,
  STORE_GOALS,
} from "@foode/shared/onboarding";
import { describe, expect, it, vi } from "vitest";

import type { AuthSession, FoodeAuth } from "./auth/auth";
import { createOnboardingService } from "./onboarding-service";
import { toStorefrontShowcase } from "./showcase";

const migration = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../packages/db/migrations/0005_onboarding_vitrine_funil.sql",
  ),
  "utf8",
);

describe("constantes D1 × @foode/shared/onboarding", () => {
  it.each([
    ["STORE_CUISINES", DB_STORE_CUISINES, STORE_CUISINES],
    ["STORE_GOALS", DB_STORE_GOALS, STORE_GOALS],
    ["FUNNEL_EVENTS", DB_FUNNEL_EVENTS, FUNNEL_EVENTS],
  ])("%s", (_name, db, shared) => {
    expect([...db]).toEqual([...shared]);
  });

  it("limites de texto", () => {
    expect(DB_STORE_DESCRIPTION_MAX).toBe(STORE_DESCRIPTION_MAX);
    expect(DB_PROFILE_OTHER_MAX).toBe(PROFILE_OTHER_MAX);
  });
});

describe("migration 0005", () => {
  it("só expand: cria tabelas, não altera nem apaga", () => {
    expect(migration).not.toMatch(/\b(DROP|ALTER|RENAME)\b/i);
    expect(migration.match(/CREATE TABLE `(\w+)`/g)).toEqual([
      "CREATE TABLE `store_funnel_daily`",
      "CREATE TABLE `store_onboarding`",
      "CREATE TABLE `store_showcases`",
    ]);
  });

  it("nenhum padrão GLOB/LIKE passa de 50 bytes (limite do D1)", () => {
    const patterns = [...migration.matchAll(/(?:GLOB|LIKE)\s+'([^']*)'/gi)].map((m) => m[1]!);
    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns)
      expect(new TextEncoder().encode(pattern).length).toBeLessThan(50);
  });

  it("CHECKs: descrição ≤ 160, datas UTC, dia civil e contador sem dado pessoal", () => {
    expect(migration).toContain(`length("description") BETWEEN 1 AND ${STORE_DESCRIPTION_MAX}`);
    expect(migration).toContain(`CHECK(date("day") IS "day")`);
    expect(migration).toContain("PRIMARY KEY(`store_id`, `day`, `event`)");
    const funnelTable = migration.slice(
      migration.indexOf("CREATE TABLE `store_funnel_daily`"),
      migration.indexOf("CREATE TABLE `store_onboarding`"),
    );
    expect(funnelTable).not.toMatch(/ip|phone|cookie|consumer|user/i);
    expect(migration.match(/strftime\('%Y-%m-%dT%H:%M:%fZ', "\w+"\) IS "\w+"/g)?.length).toBe(8);
  });
});

// ---- RPCs com sessão e banco falsos (só o guard e a tradução de erro) ----

const STORE_ID = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
const caller = { cookie: "sessao=1", ip: "10.0.0.1" };

function fakeService(who: "anon" | "ops" | "owner" | "operator", onboarding: object = {}) {
  const session: AuthSession = {
    userId: "u1",
    email: "u1@foode.test",
    name: "U1",
    sessionId: "s1",
    expiresAt: "2030-01-01T00:00:00.000Z",
    activeStoreId: who === "owner" || who === "operator" ? STORE_ID : null,
  };
  const role = who === "owner" || who === "operator" ? who : null;
  const auth = {
    getSession: async () => (who === "anon" ? null : session),
  } as unknown as FoodeAuth;
  const store = vi.fn(() => {
    if (who !== "owner") throw new Error("db.store sem StoreContext de Dono");
    return {
      get: async () => ({ id: STORE_ID, slug: "loja-a", name: "Loja A", status: "active" }),
      onboarding: () => onboarding,
    };
  });
  const db = {
    access: {
      storesOfUser: async () =>
        role ? [{ id: STORE_ID, slug: "loja-a", name: "Loja A", status: "active", role }] : [],
      opsContext: async () => (who === "ops" ? { userId: "u1" } : null),
      storeContext: async () => (role ? { storeId: STORE_ID, userId: "u1", role } : null),
    },
    rateLimit: { consume: async () => true },
    store,
  } as unknown as FoodeDb;
  const media = { head: async () => null } as unknown as R2Bucket;
  return { service: createOnboardingService({ db, auth, media, mediaBaseUrl: null }), store };
}

describe("RPCs do Dono (contrato)", () => {
  it("entrada inválida = invalid_input antes de tocar a sessão", async () => {
    const { service } = fakeService("anon");
    await expect(
      service.storeSetShowcase(caller, { description: "a".repeat(161) }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      service.storeSetPixels(caller, { metaPixelId: "1", googleTagId: null }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(service.storeSetSlug(caller, { slug: "admin" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  it("sem sessão = unauthenticated", async () => {
    await expect(fakeService("anon").service.onboardingGet(caller)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it.each(["operator", "ops"] as const)("%s = forbidden sem tocar a Loja", async (who) => {
    const { service, store } = fakeService(who);
    for (const result of [
      service.onboardingGet(caller),
      service.storeSettingsGet(caller),
      service.storeSetSlug(caller, { slug: "nova-loja" }),
      service.storeSetPixels(caller, { metaPixelId: null, googleTagId: null }),
      service.onboardingAnswerProfile(caller, {
        cuisine: { value: "pizza" },
        goal: { value: "sell_more" },
      }),
      service.funnelReport(caller, { from: "2026-11-01", to: "2026-11-02" }),
    ]) {
      await expect(result).resolves.toEqual({ ok: false, error: "forbidden" });
    }
    expect(store).not.toHaveBeenCalled();
  });

  it("Dono: checklist do servidor e link da Loja", async () => {
    const { service } = fakeService("owner", {
      checklistFacts: async () => ({
        hasWhatsapp: true,
        slugConfirmed: false,
        openingPeriods: 1,
        pickupEnabled: true,
        deliveryConfigured: false,
        availableMenuItems: 0,
        planActive: false,
        readyAcknowledged: false,
      }),
      ownerProfile: async () => null,
    });
    const result = await service.onboardingGet(caller);
    expect(result).toMatchObject({
      ok: true,
      data: {
        profileAnswered: false,
        slug: "loja-a",
        storeUrl: "https://foodedelivery.com.br/loja/loja-a",
        checklist: { pendingCount: 3, complete: false },
      },
    });
  });

  it("Dono: Slug de outra Loja = conflict; perfil repetido = conflict", async () => {
    const { service } = fakeService("owner", {
      setSlug: async () => {
        throw new FoodeDbError("slug_unavailable");
      },
      answerProfile: async () => {
        throw new FoodeDbError("conflict");
      },
    });
    await expect(service.storeSetSlug(caller, { slug: "loja-b" })).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    await expect(
      service.onboardingAnswerProfile(caller, {
        cuisine: { value: "pizza" },
        goal: { value: "sell_more" },
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
  });

  it("Dono: disponibilidade do Slug (reservado, atual, de outra Loja, livre)", async () => {
    const status = vi.fn(async (slug: string) =>
      slug === "loja-a" ? "current" : slug === "loja-b" ? "taken" : "free",
    );
    const { service } = fakeService("owner", { slugStatus: status });
    await expect(service.storeCheckSlug(caller, { slug: "Ops" })).resolves.toEqual({
      ok: true,
      data: { slug: "ops", available: false, reason: "reserved" },
    });
    await expect(service.storeCheckSlug(caller, { slug: "loja-b" })).resolves.toMatchObject({
      data: { available: false, reason: "taken" },
    });
    await expect(service.storeCheckSlug(caller, { slug: "loja-a" })).resolves.toMatchObject({
      data: { available: false, reason: "current" },
    });
    await expect(service.storeCheckSlug(caller, { slug: "nova" })).resolves.toEqual({
      ok: true,
      data: { slug: "nova", available: true, url: "https://foodedelivery.com.br/loja/nova" },
    });
    expect(status).toHaveBeenCalledTimes(3);
  });

  it("Dono: chave de imagem ausente no R2 / de outra Loja = invalid_input, nada gravado", async () => {
    const setShowcase = vi.fn();
    const { service } = fakeService("owner", { setShowcase });
    await expect(
      service.storeSetShowcase(caller, {
        logoObjectKey: "stores/9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d/brand/x.png",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(setShowcase).not.toHaveBeenCalled();
  });

  it("acknowledge com checklist incompleto = conflict", async () => {
    const acknowledgeReady = vi.fn();
    const { service } = fakeService("owner", {
      checklistFacts: async () => ({
        hasWhatsapp: false,
        slugConfirmed: false,
        openingPeriods: 0,
        pickupEnabled: false,
        deliveryConfigured: false,
        availableMenuItems: 0,
        planActive: false,
        readyAcknowledged: false,
      }),
      acknowledgeReady,
    });
    await expect(service.onboardingAcknowledgeReady(caller)).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    expect(acknowledgeReady).not.toHaveBeenCalled();
  });
});

describe("vitrine pública", () => {
  it("sem linha = vazia; com linha = URLs, sem chave do R2", () => {
    expect(toStorefrontShowcase(null, "https://api.test/media")).toEqual(EMPTY_STOREFRONT_SHOWCASE);
    const key = `stores/${STORE_ID}/brand/0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e.png`;
    const showcase = toStorefrontShowcase(
      {
        description: "Pizza no forno a lenha",
        logoObjectKey: key,
        coverObjectKey: null,
        instagram: "pizzaria.ze",
        metaPixelId: "123456789012345",
        googleTagId: "G-ABC1234",
      },
      "https://api.test/media",
    );
    expect(showcase).toEqual({
      description: "Pizza no forno a lenha",
      logoUrl: `https://api.test/media/${key}`,
      coverUrl: null,
      instagram: "pizzaria.ze",
      pixels: { metaPixelId: "123456789012345", googleTagId: "G-ABC1234" },
    });
    expect(JSON.stringify(showcase)).not.toContain('"stores/');
  });
});
