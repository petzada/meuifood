// Ticket 28 no workerd com D1 e o R2 do Miniflare (só no CI): RBAC (só o Dono configura;
// Operador e Ops = forbidden sem efeito), isolamento entre duas Lojas, Slug duplicado/reservado,
// checklist calculado no servidor, perfil uma vez e lido pelo Ops, vitrine (logo/capa pelo R2,
// descrição) exposta no `/estado`, ingestão do funil sem dado pessoal (rate limit por IP) e a
// agregação por dia. Fixture "app com duas Lojas" (@foode/db/testing).
import { env } from "cloudflare:test";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import { FUNNEL_EVENT_RATE_LIMIT, funnelDay } from "@foode/shared/onboarding";
import { storefrontStoreStateSchema } from "@foode/shared/order";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import type { EmailSender } from "./email/sender";
import type { Env } from "./env";
import { mediaBaseUrl } from "./media";
import { createMenuService } from "./menu-service";
import { createOnboardingService, type OnboardingService } from "./onboarding-service";
import { createOpsService } from "./ops-service";
import { createOrderService, type OrderService } from "./order-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
const API = "https://api.foode.test";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const forbidden = { ok: false, error: "forbidden" };

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let onboarding: OnboardingService;
let orders: OrderService;
const realFetch = globalThis.fetch;

const testEnv = () =>
  ({
    ...env,
    ORDER_TOKEN_SECRET: "segredo-de-teste-do-token-do-pedido",
    PHONE_LOOKUP_IP_SALT: "sal-de-teste-do-ip-da-busca",
    MEDIA_PUBLIC_BASE_URL: `${API}/media`,
  }) as Env;

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

function postEvent(slug: string, body: unknown, ip = "203.0.113.7") {
  return createApp().fetch(
    new Request(`${API}/storefront/lojas/${slug}/eventos`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify(body),
    }),
    testEnv(),
  );
}

const profile = {
  cuisine: { value: "other", other: "Pastelaria" },
  goal: { value: "leave_marketplaces" },
} as const;

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  onboarding = createOnboardingService({
    db,
    auth,
    media: env.MEDIA,
    mediaBaseUrl: mediaBaseUrl(`${API}/media`),
  });
  orders = createOrderService({ db, auth, orderTokenSecret: undefined });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === TURNSTILE_SITEVERIFY_URL) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { response?: string };
      return Response.json({ success: body.response === CAPTCHA_OK });
    }
    return realFetch(input, init);
  });
  const ops = await db.access.opsContext(fx.ops.id);
  await db.ops(ops!).updateStore(fx.storeA.id, storeProfileFixture());
  await db.ops(ops!).updateStore(fx.storeB.id, storeProfileFixture());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RBAC: só o Dono configura", () => {
  it("Operador e Ops = forbidden em leitura e escrita, sem efeito", async () => {
    const owner = await loginAs(fx.ownerA);
    const before = data(await onboarding.storeSettingsGet(owner));
    for (const caller of [await loginAs(fx.operatorA), await loginAs(fx.ops)]) {
      await expect(onboarding.onboardingGet(caller)).resolves.toEqual(forbidden);
      await expect(onboarding.storeSettingsGet(caller)).resolves.toEqual(forbidden);
      await expect(onboarding.storeCheckSlug(caller, { slug: "nova" })).resolves.toEqual(forbidden);
      await expect(onboarding.storeSetSlug(caller, { slug: "loja-do-operador" })).resolves.toEqual(
        forbidden,
      );
      await expect(
        onboarding.storeSetContact(caller, { whatsapp: "11912345678", instagram: "x" }),
      ).resolves.toEqual(forbidden);
      await expect(
        onboarding.storeSetPixels(caller, { metaPixelId: "123456789012345", googleTagId: null }),
      ).resolves.toEqual(forbidden);
      await expect(onboarding.storeSetShowcase(caller, { description: "x" })).resolves.toEqual(
        forbidden,
      );
      await expect(
        onboarding.storeUploadBrandImage(caller, {
          kind: "logo",
          contentType: "image/png",
          bytes: PNG,
        }),
      ).resolves.toEqual(forbidden);
      await expect(onboarding.onboardingAnswerProfile(caller, profile)).resolves.toEqual(forbidden);
      await expect(
        onboarding.funnelReport(caller, { from: "2026-11-01", to: "2026-11-02" }),
      ).resolves.toEqual(forbidden);
    }
    expect(data(await onboarding.storeSettingsGet(owner))).toEqual(before);
    expect(data(await onboarding.onboardingGet(owner)).profileAnswered).toBe(false);
  });
});

describe("Slug", () => {
  it("duplicado = conflict; reservado/inválido = invalid_input; troca audita e confirma", async () => {
    const owner = await loginAs(fx.ownerA);
    await expect(onboarding.storeSetSlug(owner, { slug: fx.storeB.slug })).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    await expect(onboarding.storeSetSlug(owner, { slug: "painel" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(onboarding.storeSetSlug(owner, { slug: "a_b" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(data(await onboarding.storeCheckSlug(owner, { slug: fx.storeB.slug }))).toMatchObject({
      available: false,
      reason: "taken",
    });

    const slug = `pizzaria-${crypto.randomUUID().slice(0, 8)}`;
    expect(data(await onboarding.storeCheckSlug(owner, { slug })).available).toBe(true);
    expect(data(await onboarding.storeSetSlug(owner, { slug }))).toEqual({
      slug,
      storeUrl: `https://foodedelivery.com.br/loja/${slug}`,
    });
    const state = data(await onboarding.onboardingGet(owner));
    expect(state.slug).toBe(slug);
    expect(state.checklist.items.find((entry) => entry.item === "slug")?.done).toBe(true);
    const trail = await db
      .store(
        (await db.access.storeContext({
          userId: fx.ownerA.id,
          storeId: fx.storeA.id,
        }))!,
      )
      .auditTrail();
    expect(trail[0]).toMatchObject({
      action: "store.slug_changed",
      metadata: { before: { slug: fx.storeA.slug }, after: { slug } },
    });
    // O link antigo continua funcionando: 308 para o atual (decisão 69).
    const old = await createApp().fetch(
      new Request(`${API}/storefront/lojas/${fx.storeA.slug}/estado`),
      testEnv(),
    );
    expect(old.status).toBe(308);
    expect(old.headers.get("location")).toBe(`/storefront/lojas/${slug}/estado`);
  });
});

describe("Link personalizado: histórico e redirecionamento (decisão 69)", () => {
  const get = (path: string, init?: RequestInit) =>
    createApp().fetch(new Request(`${API}${path}`, init), testEnv());
  const fresh = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

  it("troca grava o anterior; um salto só depois de várias trocas; query e subcaminho preservados", async () => {
    const owner = await loginAs(fx.ownerA);
    const original = fx.storeA.slug;
    const second = fresh("segundo");
    const third = fresh("terceiro");
    data(await onboarding.storeSetSlug(owner, { slug: second }));
    data(await onboarding.storeSetSlug(owner, { slug: third }));

    for (const old of [original, second]) {
      const response = await get(
        `/storefront/lojas/${old}/pedidos/token-qualquer?item=abc&utm_source=qr`,
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        `/storefront/lojas/${third}/pedidos/token-qualquer?item=abc&utm_source=qr`,
      );
      expect(response.headers.get("x-foode-current-slug")).toBe(third);
      expect(await response.json()).toEqual({ error: "slug_moved", currentSlug: third });
    }
    // POST também (308 preserva método e corpo).
    const event = await get(`/storefront/lojas/${original}/eventos`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": randomIp() },
      body: JSON.stringify({ event: "visit" }),
    });
    expect(event.status).toBe(308);
    // Link atual responde normalmente (sem redirecionar) e slug desconhecido segue 404.
    expect((await get(`/storefront/lojas/${third}`)).status).toBe(200);
    expect((await get(`/storefront/lojas/${fresh("nunca-usado")}/estado`)).status).toBe(404);
  });

  it("link antigo fica reservado: outra Loja (Dono ou Ops) recebe conflict", async () => {
    const ownerA = await loginAs(fx.ownerA);
    const original = fx.storeA.slug;
    data(await onboarding.storeSetSlug(ownerA, { slug: fresh("novo-a") }));

    const ownerB = await loginAs(fx.ownerB);
    expect(data(await onboarding.storeCheckSlug(ownerB, { slug: original }))).toMatchObject({
      available: false,
      reason: "taken",
    });
    await expect(onboarding.storeSetSlug(ownerB, { slug: original })).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    const opsService = createOpsService({ db, auth });
    const opsCaller = await loginAs(fx.ops);
    await expect(
      opsService.opsUpdateStore(opsCaller, { storeId: fx.storeB.id, slug: original }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
    await expect(
      opsService.opsCreateStore(opsCaller, {
        slug: original,
        name: "Concorrente",
        ...storeProfileFixture(),
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
    // Nada mudou na Loja B e o antigo ainda aponta para A.
    expect(data(await onboarding.storeSettingsGet(ownerB)).slug).toBe(fx.storeB.slug);
    expect((await get(`/storefront/lojas/${original}/estado`)).status).toBe(308);
  });

  it("voltar a um link antigo o tira do histórico; o intermediário passa a redirecionar", async () => {
    const owner = await loginAs(fx.ownerA);
    const original = fx.storeA.slug;
    const middle = fresh("meio");
    data(await onboarding.storeSetSlug(owner, { slug: middle }));
    expect(data(await onboarding.storeCheckSlug(owner, { slug: original })).available).toBe(true);
    data(await onboarding.storeSetSlug(owner, { slug: original }));

    expect((await get(`/storefront/lojas/${original}`)).status).toBe(200);
    const fromMiddle = await get(`/storefront/lojas/${middle}`);
    expect(fromMiddle.status).toBe(308);
    expect(fromMiddle.headers.get("location")).toBe(`/storefront/lojas/${original}`);
    const context = await db.access.storeContext({ userId: fx.ownerA.id, storeId: fx.storeA.id });
    expect((await db.store(context!).onboarding().slugHistory()).map((row) => row.slug)).toEqual([
      middle,
    ]);
  });

  it("Ops troca o link: o anterior também vai para o histórico; Loja suspensa continua redirecionando", async () => {
    const opsService = createOpsService({ db, auth });
    const opsCaller = await loginAs(fx.ops);
    const original = fx.storeB.slug;
    const next = fresh("ops-b");
    data(await opsService.opsUpdateStore(opsCaller, { storeId: fx.storeB.id, slug: next }));
    const ops = await db.access.opsContext(fx.ops.id);
    await db
      .ops(ops!)
      .changeStoreStatus(fx.storeB.id, "suspended", { allowedFrom: ["active"], reason: "teste" });
    const response = await get(`/storefront/lojas/${original}/estado`);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`/storefront/lojas/${next}/estado`);
    // Isolamento: o histórico de B não aparece para A.
    const contextA = await db.access.storeContext({ userId: fx.ownerA.id, storeId: fx.storeA.id });
    expect(await db.store(contextA!).onboarding().slugHistory()).toEqual([]);
  });
});

describe("checklist e perfil", () => {
  it("checklist do servidor acompanha o que o Dono configura; pronto aparece uma vez", async () => {
    const owner = await loginAs(fx.ownerA);
    let state = data(await onboarding.onboardingGet(owner));
    // WhatsApp veio do cadastro do Ops; o resto pendente.
    expect(state.checklist.items.filter((entry) => entry.done).map((entry) => entry.item)).toEqual([
      "contact",
    ]);
    await expect(onboarding.onboardingAcknowledgeReady(owner)).resolves.toEqual({
      ok: false,
      error: "conflict",
    });

    data(await onboarding.storeSetSlug(owner, { slug: fx.storeA.slug }));
    data(
      await orders.storeSetHours(owner, {
        periods: [{ weekday: 1, opensAt: "11:00", closesAt: "15:00" }],
      }),
    );
    data(
      await orders.storeSetFulfillment(owner, {
        pickupEnabled: true,
        deliveryMode: null,
        fixedFeeCents: null,
        neighborhoods: [],
        deliveryMinimumOrderCents: null,
        deliveryEta: null,
        pickupEta: null,
      }),
    );
    const menu = createMenuService({ db, auth, media: env.MEDIA, mediaBaseUrl: null });
    const { categoryId } = data(await menu.menuCreateCategory(owner, { name: "Pastéis" }));
    data(await menu.menuCreateItem(owner, { categoryId, name: "Pastel", priceCents: 900 }));

    state = data(await onboarding.onboardingGet(owner));
    expect(state.checklist.items.filter((entry) => !entry.done).map((entry) => entry.item)).toEqual(
      ["plan"],
    );
    const ops = await db.access.opsContext(fx.ops.id);
    await db.ops(ops!).setStorePlan(fx.storeA.id, {
      cycle: "monthly",
      validFrom: "2026-01-01T00:00:00.000Z",
    });
    state = data(await onboarding.onboardingGet(owner));
    expect(state.checklist).toMatchObject({ complete: true, showReadyMessage: true });
    data(await onboarding.onboardingAcknowledgeReady(owner));
    expect(data(await onboarding.onboardingGet(owner)).checklist.showReadyMessage).toBe(false);
    // A Loja B não foi tocada.
    const ownerB = await loginAs(fx.ownerB);
    expect(data(await onboarding.onboardingGet(ownerB)).checklist.pendingCount).toBe(5);
  });

  it("perfil uma vez, visível ao Ops e só da própria Loja", async () => {
    const owner = await loginAs(fx.ownerA);
    data(await onboarding.onboardingAnswerProfile(owner, profile));
    expect(data(await onboarding.onboardingGet(owner)).profileAnswered).toBe(true);
    await expect(
      onboarding.onboardingAnswerProfile(owner, {
        cuisine: { value: "pizza" },
        goal: { value: "sell_more" },
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });

    const opsService = createOpsService({ db, auth });
    const opsCaller = await loginAs(fx.ops);
    const detailA = data(await opsService.opsGetStore(opsCaller, { storeId: fx.storeA.id }));
    expect(detailA.ownerProfile).toMatchObject({
      cuisine: "other",
      cuisineOther: "Pastelaria",
      goal: "leave_marketplaces",
      goalOther: null,
    });
    const detailB = data(await opsService.opsGetStore(opsCaller, { storeId: fx.storeB.id }));
    expect(detailB.ownerProfile).toBeNull();
    // Nunca no Storefront.
    data(
      await orders.storeSetHours(owner, {
        periods: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          opensAt: "00:00",
          closesAt: "23:59",
        })),
      }),
    );
    const state = await createApp().fetch(
      new Request(`${API}/storefront/lojas/${fx.storeA.slug}/estado`),
      testEnv(),
    );
    expect(await state.text()).not.toMatch(/Pastelaria|leave_marketplaces|cuisine/);
  });
});

describe("contato, Pixel e vitrine", () => {
  it("grava, isola por Loja e expõe no /estado só o que é público", async () => {
    const owner = await loginAs(fx.ownerA);
    data(
      await onboarding.storeSetContact(owner, {
        whatsapp: "(11) 91234-5678",
        instagram: "@Pizzaria.Ze",
      }),
    );
    data(
      await onboarding.storeSetPixels(owner, {
        metaPixelId: "123456789012345",
        googleTagId: "G-ABC1234",
      }),
    );
    const logo = data(
      await onboarding.storeUploadBrandImage(owner, {
        kind: "logo",
        contentType: "image/png",
        bytes: PNG,
      }),
    );
    expect(logo.objectKey.startsWith(`stores/${fx.storeA.id}/brand/`)).toBe(true);
    expect(await env.MEDIA.head(logo.objectKey)).not.toBeNull();
    data(
      await onboarding.storeSetShowcase(owner, {
        description: "Pizza no forno a lenha",
        logoObjectKey: logo.objectKey,
      }),
    );
    await expect(
      onboarding.storeSetShowcase(owner, { description: "a".repeat(161) }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      onboarding.storeUploadBrandImage(owner, {
        kind: "cover",
        contentType: "image/jpeg",
        bytes: PNG,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });

    // Isolamento: a Loja B não aceita a chave da Loja A nem vê os dados dela.
    const ownerB = await loginAs(fx.ownerB);
    await expect(
      onboarding.storeSetShowcase(ownerB, { logoObjectKey: logo.objectKey }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    const settingsB = data(await onboarding.storeSettingsGet(ownerB));
    expect(settingsB).toMatchObject({
      instagram: null,
      metaPixelId: null,
      description: null,
      logoObjectKey: null,
    });

    const settingsA = data(await onboarding.storeSettingsGet(owner));
    expect(settingsA).toMatchObject({
      whatsapp: "5511912345678",
      instagram: "pizzaria.ze",
      metaPixelId: "123456789012345",
      googleTagId: "G-ABC1234",
      description: "Pizza no forno a lenha",
      logoUrl: `${API}/media/${logo.objectKey}`,
      registration: { cnpj: "11222333000181", payoutHolderName: "Titular do Repasse" },
    });

    data(
      await orders.storeSetHours(owner, {
        periods: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          opensAt: "00:00",
          closesAt: "23:59",
        })),
      }),
    );
    const response = await createApp().fetch(
      new Request(`${API}/storefront/lojas/${fx.storeA.slug}/estado`),
      testEnv(),
    );
    expect(response.status).toBe(200);
    const state = storefrontStoreStateSchema.parse(await response.json());
    expect(state.showcase).toEqual({
      description: "Pizza no forno a lenha",
      logoUrl: `${API}/media/${logo.objectKey}`,
      coverUrl: null,
      instagram: "pizzaria.ze",
      pixels: { metaPixelId: "123456789012345", googleTagId: "G-ABC1234" },
    });
    const image = await createApp().fetch(new Request(`${API}/media/${logo.objectKey}`), testEnv());
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");

    // Troca do logo apaga o antigo do R2.
    const second = data(
      await onboarding.storeUploadBrandImage(owner, {
        kind: "logo",
        contentType: "image/png",
        bytes: PNG,
      }),
    );
    data(await onboarding.storeSetShowcase(owner, { logoObjectKey: second.objectKey }));
    expect(await env.MEDIA.head(logo.objectKey)).toBeNull();
  });
});

describe("funil próprio", () => {
  it("ingere sem dado pessoal, agrega por Loja e dia e recusa corpo com PII", async () => {
    const day = funnelDay(Date.now());
    for (const event of ["visit", "visit", "item_view", "add_to_cart", "checkout_start"]) {
      expect((await postEvent(fx.storeA.slug, { event })).status).toBe(204);
    }
    expect((await postEvent(fx.storeB.slug, { event: "visit" })).status).toBe(204);
    expect((await postEvent(fx.storeA.slug, { event: "visit", phone: "11987654321" })).status).toBe(
      400,
    );
    expect((await postEvent(fx.storeA.slug, { event: "order" })).status).toBe(400);
    expect((await postEvent("loja-que-nao-existe", { event: "visit" })).status).toBe(404);

    // Colunas da tabela (sem IP/telefone/cookie): conferidas em packages/db/src/onboarding.d1.test.ts.

    const owner = await loginAs(fx.ownerA);
    const report = data(await onboarding.funnelReport(owner, { from: day, to: day }));
    expect(report.totals).toEqual({
      visit: 2,
      item_view: 1,
      add_to_cart: 1,
      checkout_start: 1,
      order: 0,
    });
    const ownerB = await loginAs(fx.ownerB);
    expect(data(await onboarding.funnelReport(ownerB, { from: day, to: day })).totals.visit).toBe(
      1,
    );
  });

  it("rate limit por IP e Loja", async () => {
    const ip = randomIp();
    for (let i = 0; i < FUNNEL_EVENT_RATE_LIMIT.max; i += 1) {
      expect((await postEvent(fx.storeA.slug, { event: "visit" }, ip)).status).toBe(204);
    }
    expect((await postEvent(fx.storeA.slug, { event: "visit" }, ip)).status).toBe(429);
    expect((await postEvent(fx.storeA.slug, { event: "visit" }, randomIp())).status).toBe(204);
  });

  it("Loja fora de active não conta", async () => {
    const ops = await db.access.opsContext(fx.ops.id);
    await db
      .ops(ops!)
      .changeStoreStatus(fx.storeA.id, "suspended", { allowedFrom: ["active"], reason: "teste" });
    expect((await postEvent(fx.storeA.slug, { event: "visit" })).status).toBe(404);
  });
});
