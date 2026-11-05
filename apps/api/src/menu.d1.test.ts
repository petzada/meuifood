// Cardápio pelo Painel e pelo Storefront no workerd com D1 e o R2 do Miniflare (só no CI).
// RBAC (Operador e Ops = forbidden, sem efeito), isolamento entre duas Lojas, upload pelos bytes
// (decisão 64), leitura pública em /media, Cardápio público só de Loja `active` e recálculo do
// carrinho no servidor com o preço das opções. Fixture "app com duas Lojas" (@foode/db/testing).
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import { seedTwoStores, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import {
  cartQuoteResponseSchema,
  isStoreMenuImageKey,
  MENU_IMAGE_MAX_BYTES,
  publicMenuSchema,
} from "@foode/shared/menu";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import type { EmailSender } from "./email/sender";
import { mediaBaseUrl } from "./media";
import { createMenuService, type MenuService } from "./menu-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
const API = "https://api.foode.test";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let menu: MenuService;
const realFetch = globalThis.fetch;

function randomIp(): string {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

function authRequest(path: string, body: unknown): Request {
  return new Request(`${PANEL}/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: PANEL,
      "cf-connecting-ip": randomIp(),
      "x-captcha-response": CAPTCHA_OK,
    },
    body: JSON.stringify(body),
  });
}

async function loginAs(user: { id: string; email: string }): Promise<PainelCaller> {
  const token = await auth.createSetPasswordToken(user.id, INVITE_TOKEN_TTL_SECONDS);
  const reset = await auth.handler(
    authRequest("/reset-password", { token, newPassword: PASSWORD }),
  );
  expect(reset.status).toBe(200);
  const login = await auth.handler(
    authRequest("/sign-in/email", { email: user.email, password: PASSWORD }),
  );
  expect(login.status).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { cookie, ip: randomIp() };
}

function data<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`esperava ok, veio ${result.error}`);
  return result.data;
}

function get(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`${API}${path}`, init));
}

function postCart(slug: string, body: unknown) {
  return get(`/storefront/lojas/${slug}/carrinho`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Lanche com grupo obrigatório de opção paga e Adicional, na Loja A. */
async function seedBurger(owner: PainelCaller) {
  const { categoryId } = data(await menu.menuCreateCategory(owner, { name: "Lanches" }));
  const { itemId } = data(
    await menu.menuCreateItem(owner, {
      categoryId,
      name: "X-Burger",
      priceCents: 2590,
      featured: true,
    }),
  );
  const { groupId } = data(
    await menu.menuCreateComplementGroup(owner, {
      itemId,
      name: "Borda",
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: "Tradicional" }, { name: "Catupiry", priceCents: 990 }],
    }),
  );
  const { additionalId } = data(
    await menu.menuCreateAdditional(owner, { itemId, name: "Bacon", priceCents: 500 }),
  );
  const full = data(await menu.menuGet(owner));
  const options = full.categories[0]!.items[0]!.complementGroups[0]!.options;
  return { categoryId, itemId, groupId, additionalId, options };
}

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  menu = createMenuService({
    db,
    auth,
    media: env.MEDIA,
    mediaBaseUrl: mediaBaseUrl(env.MEDIA_PUBLIC_BASE_URL, API),
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === TURNSTILE_SITEVERIFY_URL) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { response?: string };
      return Response.json({ success: body.response === CAPTCHA_OK });
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RBAC do Cardápio", () => {
  it("Operador e Ops = forbidden em leitura, escrita e upload, sem efeito", async () => {
    const owner = await loginAs(fx.ownerA);
    const { categoryId, itemId } = await seedBurger(owner);
    const before = data(await menu.menuGet(owner));
    const auditBefore = await db
      .store(
        (await db.access.storeContext({
          userId: fx.ownerA.id,
          storeId: fx.storeA.id,
        }))!,
      )
      .auditTrail(200);

    for (const user of [fx.operatorA, fx.ops]) {
      const caller = await loginAs(user);
      const forbidden = { ok: false, error: "forbidden" };
      await expect(menu.menuGet(caller)).resolves.toEqual(forbidden);
      await expect(menu.menuCreateCategory(caller, { name: "X" })).resolves.toEqual(forbidden);
      await expect(menu.menuUpdateItem(caller, { itemId, priceCents: 1 })).resolves.toEqual(
        forbidden,
      );
      await expect(menu.menuDeleteCategory(caller, { categoryId })).resolves.toEqual(forbidden);
      await expect(
        menu.menuUploadImage(caller, { contentType: "image/png", bytes: PNG }),
      ).resolves.toEqual(forbidden);
    }
    await expect(menu.menuGet({ cookie: "", ip: null })).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });

    expect(data(await menu.menuGet(owner))).toEqual(before);
    const auditAfter = await db
      .store(
        (await db.access.storeContext({
          userId: fx.ownerA.id,
          storeId: fx.storeA.id,
        }))!,
      )
      .auditTrail(200);
    expect(auditAfter).toHaveLength(auditBefore.length);
    const listed = await env.MEDIA.list({ prefix: `stores/${fx.storeA.id}/` });
    expect(listed.objects).toHaveLength(0);
  });

  it("pelo binding PainelApi: Dono lê o Cardápio, Operador não", async () => {
    const owner = await loginAs(fx.ownerA);
    await seedBurger(owner);
    const viaBinding = await exports.PainelApi.menuGet(owner);
    expect(viaBinding.ok).toBe(true);
    const operator = await loginAs(fx.operatorA);
    await expect(exports.PainelApi.menuGet(operator)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("isolamento entre Lojas pelas RPCs", () => {
  it("Dono de B não lê nem escreve o Cardápio de A (ids adivinhados = not_found)", async () => {
    const ownerA = await loginAs(fx.ownerA);
    const ownerB = await loginAs(fx.ownerB);
    const { categoryId, itemId, groupId, additionalId } = await seedBurger(ownerA);
    const before = data(await menu.menuGet(ownerA));

    expect(data(await menu.menuGet(ownerB)).categories).toEqual([]);
    const notFound = { ok: false, error: "not_found" };
    await expect(menu.menuUpdateItem(ownerB, { itemId, priceCents: 1 })).resolves.toEqual(notFound);
    await expect(menu.menuDeleteItem(ownerB, { itemId })).resolves.toEqual(notFound);
    await expect(
      menu.menuCreateItem(ownerB, { categoryId, name: "Intruso", priceCents: 1 }),
    ).resolves.toEqual(notFound);
    await expect(
      menu.menuUpdateComplementGroup(ownerB, { groupId, name: "Invadido" }),
    ).resolves.toEqual(notFound);
    await expect(menu.menuDeleteAdditional(ownerB, { additionalId })).resolves.toEqual(notFound);
    await expect(
      menu.menuReorderCategories(ownerB, { orderedCategoryIds: [categoryId] }),
    ).resolves.toEqual({ ok: false, error: "conflict" });

    expect(data(await menu.menuGet(ownerA))).toEqual(before);
  });

  it("imagem: chave de outra Loja ou inexistente no R2 = invalid_input", async () => {
    const ownerA = await loginAs(fx.ownerA);
    const ownerB = await loginAs(fx.ownerB);
    const { itemId } = await seedBurger(ownerA);
    const uploadB = data(
      await menu.menuUploadImage(ownerB, { contentType: "image/png", bytes: PNG }),
    );
    await expect(
      menu.menuUpdateItem(ownerA, { itemId, imageObjectKey: uploadB.objectKey }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      menu.menuUpdateItem(ownerA, {
        itemId,
        imageObjectKey: `stores/${fx.storeA.id}/menu/${crypto.randomUUID()}.png`,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    // O objeto de B continua lá.
    expect(await env.MEDIA.head(uploadB.objectKey)).not.toBeNull();
  });
});

describe("upload de imagem pelos bytes (R2 por binding)", () => {
  it("bytes inválidos ou que não batem com o tipo = invalid_input, nada gravado", async () => {
    const owner = await loginAs(fx.ownerA);
    const tooBig = new Uint8Array(MENU_IMAGE_MAX_BYTES + 1);
    tooBig.set(PNG);
    for (const input of [
      { contentType: "image/png", bytes: new TextEncoder().encode("<svg onload=alert(1)>") },
      { contentType: "image/png", bytes: JPEG },
      { contentType: "image/gif", bytes: new TextEncoder().encode("GIF89a") },
      { contentType: "image/png", bytes: new Uint8Array(0) },
      { contentType: "image/png", bytes: tooBig },
      { contentType: "image/png", bytes: "iVBORw0KGgo=" },
    ]) {
      await expect(menu.menuUploadImage(owner, input)).resolves.toEqual({
        ok: false,
        error: "invalid_input",
      });
    }
    const listed = await env.MEDIA.list({ prefix: `stores/${fx.storeA.id}/` });
    expect(listed.objects).toHaveLength(0);
  });

  it("grava na chave da Loja, serve em /media, troca apaga a antiga e apagar o item também", async () => {
    const owner = await loginAs(fx.ownerA);
    const { itemId } = await seedBurger(owner);

    // Pelo binding: os bytes atravessam a RPC.
    const first = await exports.PainelApi.menuUploadImage(owner, {
      contentType: "image/png",
      bytes: PNG.buffer,
    });
    if (!first.ok) throw new Error(first.error);
    expect(isStoreMenuImageKey(fx.storeA.id, first.data.objectKey)).toBe(true);
    data(await menu.menuUpdateItem(owner, { itemId, imageObjectKey: first.data.objectKey }));

    const served = await get(`/media/${first.data.objectKey}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
    const etag = served.headers.get("etag");
    expect(etag).toBeTruthy();
    const revalidated = await get(`/media/${first.data.objectKey}`, {
      headers: { "if-none-match": etag! },
    });
    expect(revalidated.status).toBe(304);

    const second = data(
      await menu.menuUploadImage(owner, { contentType: "image/jpeg", bytes: JPEG }),
    );
    expect(second.objectKey.endsWith(".jpg")).toBe(true);
    data(await menu.menuUpdateItem(owner, { itemId, imageObjectKey: second.objectKey }));
    expect(await env.MEDIA.head(first.data.objectKey)).toBeNull();
    expect((await get(`/media/${first.data.objectKey}`)).status).toBe(404);

    const read = data(await menu.menuGet(owner));
    const item = read.categories[0]!.items[0]!;
    expect(item.imageObjectKey).toBe(second.objectKey);
    expect(item.imageUrl).toBe(
      `${mediaBaseUrl(env.MEDIA_PUBLIC_BASE_URL, API)}/${second.objectKey}`,
    );

    data(await menu.menuDeleteItem(owner, { itemId }));
    expect(await env.MEDIA.head(second.objectKey)).toBeNull();
  });

  it("/media só serve chaves do padrão", async () => {
    for (const path of [
      `/media/stores/${fx.storeA.id}/menu/foto.png`,
      `/media/stores/${fx.storeA.id}/menu/${crypto.randomUUID()}.svg`,
      `/media/stores/loja-a/menu/${crypto.randomUUID()}.png`,
      `/media/stores/${fx.storeA.id}/outra/${crypto.randomUUID()}.png`,
      `/media/stores/${fx.storeA.id}/menu/${crypto.randomUUID()}.png`,
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});

describe("Storefront público", () => {
  it("Cardápio válido pelo publicMenuSchema, sem store_id e com preço das opções", async () => {
    const owner = await loginAs(fx.ownerA);
    const { itemId } = await seedBurger(owner);
    const { categoryId: hidden } = data(
      await menu.menuCreateCategory(owner, { name: "Escondida", available: false }),
    );
    data(await menu.menuCreateItem(owner, { categoryId: hidden, name: "Oculto", priceCents: 1 }));

    const response = await get(`/storefront/lojas/${fx.storeA.slug}/cardapio`);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    const parsed = publicMenuSchema.parse(body);
    expect(parsed.slug).toBe(fx.storeA.slug);
    expect(parsed.categories.map((category) => category.name)).toEqual(["Lanches"]);
    const item = parsed.categories[0]!.items[0]!;
    expect(item).toMatchObject({ id: itemId, featured: true, available: true, imageUrl: null });
    expect(item.complementGroups[0]!.options.map((option) => option.priceCents)).toEqual([0, 990]);
    expect(JSON.stringify(body)).not.toContain(fx.storeA.id);
    expect(JSON.stringify(body)).not.toContain("imageObjectKey");

    // Item indisponível continua visível, marcado.
    data(await menu.menuUpdateItem(owner, { itemId, available: false }));
    const again = publicMenuSchema.parse(
      await (await get(`/storefront/lojas/${fx.storeA.slug}/cardapio`)).json(),
    );
    expect(again.categories[0]!.items[0]!.available).toBe(false);
  });

  it("Loja não ativa ou Slug inexistente: 404 store_not_found (Cardápio indisponível)", async () => {
    const owner = await loginAs(fx.ownerA);
    const { itemId } = await seedBurger(owner);
    const ops = await db.access.opsContext(fx.ops.id);
    await db.ops(ops!).setStoreStatus(fx.storeA.id, "suspended");

    const menuResponse = await get(`/storefront/lojas/${fx.storeA.slug}/cardapio`);
    expect(menuResponse.status).toBe(404);
    await expect(menuResponse.json()).resolves.toEqual({ error: "store_not_found" });
    const cart = await postCart(fx.storeA.slug, {
      lines: [{ itemId, quantity: 1, additionalIds: [], complementSelections: {} }],
    });
    expect(cart.status).toBe(404);
    expect((await get("/storefront/lojas/nao-existe/cardapio")).status).toBe(404);
    expect((await get("/storefront/lojas/..%2Fadmin/cardapio")).status).toBe(404);
  });

  it("recálculo do carrinho no servidor soma item + opção paga + Adicional; ignora preço do cliente", async () => {
    const owner = await loginAs(fx.ownerA);
    const { itemId, groupId, additionalId, options } = await seedBurger(owner);
    const catupiry = options.find((option) => option.name === "Catupiry")!;

    const response = await postCart(fx.storeA.slug, {
      lines: [
        {
          itemId,
          quantity: 2,
          additionalIds: [additionalId],
          complementSelections: { [groupId]: [catupiry.id] },
          // Campos extras do navegador não entram no cálculo.
          priceCents: 1,
          unitPriceCents: 1,
        },
      ],
      subtotalCents: 1,
    });
    expect(response.status).toBe(200);
    const quote = cartQuoteResponseSchema.parse(await response.json());
    expect(quote).toEqual({
      ok: true,
      subtotalCents: (2590 + 990 + 500) * 2,
      lines: [{ itemId, subtotalCents: (2590 + 990 + 500) * 2 }],
    });

    // Preço muda no Painel → o recálculo acompanha.
    data(await menu.menuUpdateItem(owner, { itemId, priceCents: 3000 }));
    const repriced = cartQuoteResponseSchema.parse(
      await (
        await postCart(fx.storeA.slug, {
          lines: [
            {
              itemId,
              quantity: 1,
              additionalIds: [],
              complementSelections: { [groupId]: [catupiry.id] },
            },
          ],
        })
      ).json(),
    );
    expect(repriced).toMatchObject({ ok: true, subtotalCents: 3990 });
  });

  it("carrinho: grupo obrigatório vazio, item de outra Loja e corpo inválido", async () => {
    const ownerA = await loginAs(fx.ownerA);
    const ownerB = await loginAs(fx.ownerB);
    const { itemId } = await seedBurger(ownerA);
    const missing = cartQuoteResponseSchema.parse(
      await (
        await postCart(fx.storeA.slug, {
          lines: [{ itemId, quantity: 1, additionalIds: [], complementSelections: {} }],
        })
      ).json(),
    );
    expect(missing).toMatchObject({
      ok: false,
      lineIndex: 0,
      error: { code: "complement_too_few" },
    });

    // Item da Loja A no carrinho da Loja B: não existe lá.
    data(await menu.menuCreateCategory(ownerB, { name: "B" }));
    const crossStore = cartQuoteResponseSchema.parse(
      await (
        await postCart(fx.storeB.slug, {
          lines: [{ itemId, quantity: 1, additionalIds: [], complementSelections: {} }],
        })
      ).json(),
    );
    expect(crossStore).toMatchObject({ ok: false, error: { code: "item_not_found" } });

    expect((await postCart(fx.storeA.slug, { lines: [] })).status).toBe(400);
    expect((await postCart(fx.storeA.slug, { storeId: fx.storeB.id })).status).toBe(400);
    const notJson = await get(`/storefront/lojas/${fx.storeA.slug}/carrinho`, {
      method: "POST",
      body: "{",
    });
    expect(notJson.status).toBe(400);
  });
});
