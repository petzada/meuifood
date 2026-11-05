// Contrato do Ticket 23 sem banco: limites do D1 = limites de @foode/shared; as RPCs do Cardápio
// validam a entrada e só passam com StoreContext de Dono (Operador e Ops = `forbidden`); as rotas
// públicas do Storefront existem. Regras com D1 ficam em *.d1.test.ts (CI).
import {
  type FoodeDb,
  MENU_DESCRIPTION_MAX,
  MENU_MAX_CENTS,
  MENU_MAX_OPTIONS,
  MENU_NAME_MAX,
} from "@foode/db";
import { MAX_CENTS } from "@foode/shared/money";
import { MAX_COMPLEMENT_OPTIONS, menuDescriptionSchema, menuNameSchema } from "@foode/shared/menu";
import { describe, expect, it } from "vitest";

import type { AuthSession, FoodeAuth } from "./auth/auth";
import { rolesWith } from "./auth/guard";
import { createMenuService } from "./menu-service";

describe("limites do D1 × @foode/shared/menu", () => {
  it("centavos, opções, nome e descrição", () => {
    expect(MENU_MAX_CENTS).toBe(MAX_CENTS);
    expect(MENU_MAX_OPTIONS).toBe(MAX_COMPLEMENT_OPTIONS);
    expect(menuNameSchema.safeParse("x".repeat(MENU_NAME_MAX)).success).toBe(true);
    expect(menuNameSchema.safeParse("x".repeat(MENU_NAME_MAX + 1)).success).toBe(false);
    expect(menuDescriptionSchema.safeParse("x".repeat(MENU_DESCRIPTION_MAX)).success).toBe(true);
    expect(menuDescriptionSchema.safeParse("x".repeat(MENU_DESCRIPTION_MAX + 1)).success).toBe(
      false,
    );
  });
});

const STORE_ID = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
const CATEGORY_ID = "0b6f4d2e-3c1a-4e5b-9a8c-7d6e5f4a3b2c";
const caller = { cookie: "sessao=1", ip: "10.0.0.1" };

function fakeService(who: "anon" | "ops" | "owner" | "operator") {
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
  const db = {
    access: {
      storesOfUser: async () =>
        role ? [{ id: STORE_ID, slug: "loja-a", name: "Loja A", status: "active", role }] : [],
      opsContext: async () => (who === "ops" ? { userId: "u1" } : null),
      storeContext: async () => (role ? { storeId: STORE_ID, userId: "u1", role } : null),
    },
  } as unknown as FoodeDb;
  return createMenuService({ db, auth });
}

describe("RPCs do Cardápio (contrato)", () => {
  it("política: só o Dono tem store.menu", () => {
    expect(rolesWith("store.menu")).toEqual(["owner"]);
  });

  it("entrada inválida = invalid_input antes de tocar a sessão", async () => {
    const service = fakeService("anon");
    await expect(service.menuCreateCategory(caller, { name: "" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      service.menuRequestImageUpload(caller, { contentType: "image/gif", contentLength: 10 }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(service.menuGet(caller)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it.each(["operator", "ops"] as const)("%s = forbidden", async (who) => {
    const service = fakeService(who);
    await expect(service.menuGet(caller)).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(
      service.menuCreateItem(caller, { categoryId: CATEGORY_ID, name: "X", priceCents: 100 }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(
      service.menuRequestImageUpload(caller, { contentType: "image/png", contentLength: 1000 }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
  });

  it("Dono passa o guard (corpo ainda not_implemented)", async () => {
    const service = fakeService("owner");
    await expect(service.menuGet(caller)).resolves.toEqual({
      ok: false,
      error: "not_implemented",
    });
    await expect(
      service.menuCopyComplementGroups(caller, {
        sourceItemId: CATEGORY_ID,
        targetItemId: STORE_ID,
      }),
    ).resolves.toEqual({ ok: false, error: "not_implemented" });
  });
});
