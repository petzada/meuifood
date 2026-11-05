// Ticket 24a no workerd com D1 (só no CI): checkout do Storefront (estado, cotação, criação
// idempotente, Pausa/horário/mínimo/troco/bairro/meio recusados no servidor), página do Pedido
// por token, busca por telefone (Turnstile, rate limit por IP e por telefone, máscara, "Sou eu"
// de uso único), RBAC das RPCs com sessão real (Operador opera Pedidos e Pausa, não configura) e
// isolamento entre duas Lojas. A configuração da Loja é gravada pelas próprias RPCs do Dono.
import { env } from "cloudflare:test";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import {
  checkoutCreateResponseSchema,
  type CheckoutCreateRequestInput,
  phoneLookupResponseSchema,
  storefrontStoreStateSchema,
} from "@foode/shared/order";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import type { EmailSender } from "./email/sender";
import type { Env } from "./env";
import { createMenuService } from "./menu-service";
import { createOrderService, type OrderService } from "./order-service";
import { createStorefrontService, type StorefrontService } from "./storefront-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
const SECRETS = {
  orderTokenSecret: "segredo-de-teste-do-token-do-pedido",
  phoneLookupIpSalt: "sal-de-teste-do-ip-da-busca",
};
// Quinta-feira, 12:00 em São Paulo.
const OPEN_NOW = new Date("2026-11-05T15:00:00.000Z");
const CLOSED_NOW = new Date("2026-11-05T19:00:00.000Z");

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let orders: OrderService;
let owner: PainelCaller;
let ids: { itemId: string; centroId: string; vilaId: string };
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

function storefront(now = OPEN_NOW): StorefrontService {
  return createStorefrontService({
    db,
    turnstile: { verify: async (token) => token === CAPTCHA_OK },
    ...SECRETS,
    now: () => now,
  });
}

/** Configura a Loja pelas RPCs do Dono: horários, Retirada, Delivery por bairro e um item. */
async function configureStore(
  caller: PainelCaller,
  hours = [{ weekday: 4, opensAt: "11:00", closesAt: "15:00" }],
) {
  data(await orders.storeSetHours(caller, { periods: hours }));
  data(
    await orders.storeSetFulfillment(caller, {
      pickupEnabled: true,
      deliveryMode: "neighborhood",
      fixedFeeCents: null,
      neighborhoods: [
        { name: "Centro", feeCents: 500, active: true },
        { name: "Vila Inativa", feeCents: 900, active: false },
      ],
      deliveryMinimumOrderCents: null,
      deliveryEta: { minMinutes: 40, maxMinutes: 60 },
      pickupEta: { minMinutes: 15, maxMinutes: 20 },
    }),
  );
  data(await orders.storeSetCardBrands(caller, { debit: ["visa"], credit: ["mastercard"] }));
  const menu = createMenuService({ db, auth, media: env.MEDIA, mediaBaseUrl: null });
  const { categoryId } = data(await menu.menuCreateCategory(caller, { name: "Lanches" }));
  const { itemId } = data(
    await menu.menuCreateItem(caller, { categoryId, name: "X-Burger", priceCents: 2590 }),
  );
  const settings = data(await orders.storeOperationGet(caller));
  return {
    itemId,
    centroId: settings.neighborhoods.find((n) => n.name === "Centro")!.id,
    vilaId: settings.neighborhoods.find((n) => n.name === "Vila Inativa")!.id,
  };
}

function createBody(
  overrides: Partial<CheckoutCreateRequestInput> = {},
): CheckoutCreateRequestInput {
  return {
    idempotencyKey: crypto.randomUUID(),
    lines: [{ itemId: ids.itemId, quantity: 2, complementSelections: {}, additionalIds: [] }],
    fulfillment: "delivery",
    address: {
      postalCode: "01310-100",
      street: "Rua do Consumidor",
      number: "42",
      complement: "Apto 3",
      reference: null,
      neighborhoodId: ids.centroId,
    },
    customer: { name: "Maria Souza", phone: "(11) 91234-5678" },
    payment: { method: "on_delivery", changeForCents: 10000 },
    note: "Sem cebola",
    ...overrides,
  };
}

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  orders = createOrderService({ db, auth, orderTokenSecret: SECRETS.orderTokenSecret });
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
  owner = await loginAs(fx.ownerA);
  ids = await configureStore(owner);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("estado da Loja e cotação", () => {
  it("aberta, só bairros ativos, Retirada com endereço, bandeiras e só on_delivery", async () => {
    const reply = await storefront().state(fx.storeA.slug);
    expect(reply.status).toBe(200);
    const state = storefrontStoreStateSchema.parse(reply.body);
    expect(state.availability.state).toBe("open");
    expect(state.delivery).toMatchObject({
      mode: "neighborhood",
      neighborhoods: [{ id: ids.centroId, name: "Centro", feeCents: 500 }],
    });
    expect(state.pickup?.address.street).toBe("Avenida Paulista");
    expect(state.paymentMethods).toEqual(["on_delivery"]);
    expect(state.cardBrands).toEqual({ debit: ["visa"], credit: ["mastercard"] });
    expect(JSON.stringify(state)).not.toContain(fx.storeA.id);

    const closed = await storefront(CLOSED_NOW).state(fx.storeA.slug);
    expect(storefrontStoreStateSchema.parse(closed.body).availability.state).toBe("closed");
    await expect(storefront().state("loja-inexistente")).resolves.toMatchObject({ status: 404 });
  });

  it("cotação recalcula no servidor e não grava nada", async () => {
    const reply = await storefront().quote(fx.storeA.slug, {
      lines: [{ itemId: ids.itemId, quantity: 2, complementSelections: {}, additionalIds: [] }],
      fulfillment: "delivery",
      address: { street: "Rua", number: "1", neighborhoodId: ids.centroId },
    });
    expect(reply).toEqual({
      status: 200,
      body: {
        ok: true,
        subtotalCents: 5180,
        deliveryFeeCents: 500,
        discountCents: 0,
        totalCents: 5680,
        minimumOrder: null,
        coupon: null,
        eta: { minMinutes: 40, maxMinutes: 60 },
        paymentMethods: ["on_delivery"],
      },
    });
    const list = data(await orders.ordersList(owner));
    expect(list.orders).toHaveLength(0);
  });
});

describe("criação idempotente do Pedido", () => {
  it("201 na criação; retry com a mesma chave = 200 com o mesmo Pedido; corpo diferente = 409", async () => {
    const body = createBody();
    const created = await storefront().create(fx.storeA.slug, body);
    expect(created.status).toBe(201);
    const first = checkoutCreateResponseSchema.parse(created.body);
    if (!first.ok) throw new Error("esperava ok");
    expect(first).toMatchObject({ replayed: false, orderCode: 1 });
    expect(first.trackingPath).toBe(`/loja/${fx.storeA.slug}/pedido/${first.accessToken}`);

    // Retry depois de a Loja fechar continua devolvendo o mesmo Pedido.
    const retry = await storefront(CLOSED_NOW).create(fx.storeA.slug, body);
    expect(retry).toEqual({ status: 200, body: { ...first, replayed: true } });

    const conflict = await storefront().create(fx.storeA.slug, { ...body, note: "Outra coisa" });
    expect(conflict).toEqual({
      status: 409,
      body: { ok: false, error: { code: "idempotency_conflict" } },
    });
    const list = data(await orders.ordersList(owner));
    expect(list.orders).toHaveLength(1);
    expect(list.orders[0]).toMatchObject({
      code: 1,
      customerName: "Maria Souza",
      neighborhood: "Centro",
      totalCents: 5680,
      next: ["preparing"],
    });
  });

  it("Pausa ativada pelo Operador entre o carrinho e o envio rejeita (409 store_paused)", async () => {
    const quote = await storefront().quote(fx.storeA.slug, {
      lines: createBody().lines,
      fulfillment: "pickup",
    });
    expect(quote.body).toMatchObject({ ok: true });
    const operator = await loginAs(fx.operatorA);
    data(await orders.storeSetPause(operator, { paused: true }));
    const reply = await storefront().create(
      fx.storeA.slug,
      createBody({ fulfillment: "pickup", address: null }),
    );
    expect(reply).toEqual({ status: 409, body: { ok: false, error: { code: "store_paused" } } });
    expect(
      storefrontStoreStateSchema.parse((await storefront().state(fx.storeA.slug)).body)
        .availability,
    ).toEqual({ state: "paused" });
    expect(data(await orders.ordersList(owner)).orders).toHaveLength(0);
  });

  it("fechada, mínimo, troco, bairro inativo, meio online e item indisponível são recusados no servidor", async () => {
    await expect(storefront(CLOSED_NOW).create(fx.storeA.slug, createBody())).resolves.toEqual({
      status: 409,
      body: { ok: false, error: { code: "store_closed" } },
    });
    await expect(
      storefront().create(
        fx.storeA.slug,
        createBody({ payment: { method: "on_delivery", changeForCents: 5000 } }),
      ),
    ).resolves.toEqual({ status: 422, body: { ok: false, error: { code: "change_below_total" } } });
    await expect(
      storefront().create(fx.storeA.slug, createBody({ payment: { method: "pix" } })),
    ).resolves.toEqual({
      status: 422,
      body: { ok: false, error: { code: "payment_method_unavailable" } },
    });
    await expect(
      storefront().create(
        fx.storeA.slug,
        createBody({
          address: { street: "Rua", number: "1", neighborhoodId: ids.vilaId },
        }),
      ),
    ).resolves.toEqual({
      status: 422,
      body: { ok: false, error: { code: "neighborhood_not_served" } },
    });

    data(
      await orders.storeSetFulfillment(owner, {
        pickupEnabled: true,
        deliveryMode: "neighborhood",
        fixedFeeCents: null,
        neighborhoods: [
          { id: ids.centroId, name: "Centro", feeCents: 500, active: true },
          { id: ids.vilaId, name: "Vila Inativa", feeCents: 900, active: false },
        ],
        deliveryMinimumOrderCents: 6000,
        deliveryEta: null,
        pickupEta: null,
      }),
    );
    await expect(storefront().create(fx.storeA.slug, createBody())).resolves.toEqual({
      status: 422,
      body: { ok: false, error: { code: "below_minimum", minimumCents: 6000, missingCents: 820 } },
    });
    // Mínimo é só do Delivery.
    await expect(
      storefront().create(
        fx.storeA.slug,
        createBody({ fulfillment: "pickup", address: null, payment: { method: "on_delivery" } }),
      ),
    ).resolves.toMatchObject({ status: 201 });

    const menu = createMenuService({ db, auth, media: env.MEDIA, mediaBaseUrl: null });
    data(await menu.menuUpdateItem(owner, { itemId: ids.itemId, available: false }));
    await expect(
      storefront().create(
        fx.storeA.slug,
        createBody({ fulfillment: "pickup", address: null, payment: { method: "on_delivery" } }),
      ),
    ).resolves.toMatchObject({
      status: 422,
      body: { ok: false, error: { code: "cart_invalid", lineIndex: 0 } },
    });
  });

  it("Loja de outro Slug ou suspensa = 404; item de outra Loja = cart_invalid", async () => {
    const ownerB = await loginAs(fx.ownerB);
    const b = await configureStore(ownerB);
    await expect(
      storefront().create(
        fx.storeA.slug,
        createBody({
          lines: [{ itemId: b.itemId, quantity: 1, complementSelections: {}, additionalIds: [] }],
        }),
      ),
    ).resolves.toMatchObject({ status: 422, body: { ok: false, error: { code: "cart_invalid" } } });
    const ops = await db.access.opsContext(fx.ops.id);
    await db
      .ops(ops!)
      .changeStoreStatus(fx.storeA.id, "suspended", { allowedFrom: ["active"], reason: "teste" });
    await expect(storefront().create(fx.storeA.slug, createBody())).resolves.toMatchObject({
      status: 404,
    });
  });
});

describe("Loja em onboarding (prévia, decisão 74)", () => {
  it("Cardápio aparece em prévia, mas cotação e Pedido continuam recusados", async () => {
    const ops = await db.access.opsContext(fx.ops.id);
    await db
      .ops(ops!)
      .changeStoreStatus(fx.storeA.id, "onboarding", { allowedFrom: ["active"], reason: "teste" });
    await expect(storefront().create(fx.storeA.slug, createBody())).resolves.toMatchObject({
      status: 404,
    });
    const { address, fulfillment, lines } = createBody();
    const quote = await storefront().quote(fx.storeA.slug, { address, fulfillment, lines }, null);
    expect(quote.status).toBe(404);
  });
});

describe("página do Pedido por token", () => {
  it("token desta Loja = 200 sem telefone; outra Loja, token adulterado ou inválido = 404", async () => {
    const created = checkoutCreateResponseSchema.parse(
      (await storefront().create(fx.storeA.slug, createBody())).body,
    );
    if (!created.ok) throw new Error("esperava ok");
    const page = await storefront().track(fx.storeA.slug, created.accessToken);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({
      code: 1,
      status: "received",
      customerFirstName: "Maria",
      totalCents: 5680,
      payment: { method: "on_delivery", changeForCents: 10000 },
      note: "Sem cebola",
      eta: { minMinutes: 40, maxMinutes: 60 },
      address: { street: "Rua do Consumidor", number: "42", neighborhood: "Centro" },
      store: { slug: fx.storeA.slug, name: "Loja A", whatsapp: "5511987654321" },
    });
    expect(JSON.stringify(page.body)).not.toContain("91234");

    const notFound = { status: 404, body: { error: "order_not_found" } };
    await expect(storefront().track(fx.storeB.slug, created.accessToken)).resolves.toEqual(
      notFound,
    );
    const tampered = `${created.accessToken.slice(0, -1)}${created.accessToken.endsWith("A") ? "B" : "A"}`;
    await expect(storefront().track(fx.storeA.slug, tampered)).resolves.toEqual(notFound);
    await expect(storefront().track(fx.storeA.slug, "curto")).resolves.toEqual(notFound);

    // O Painel remonta o mesmo link a partir do id.
    const list = data(await orders.ordersList(owner));
    const detail = data(await orders.ordersGet(owner, { orderId: list.orders[0]!.id }));
    expect(detail.trackingPath).toBe(created.trackingPath);
    expect(detail.customer).toEqual({ name: "Maria Souza", phone: "5511912345678" });
  });
});

describe("busca por telefone (P-2.1)", () => {
  it("Turnstile, máscara, Sou eu de uso único e só a mesma Loja", async () => {
    await storefront().create(fx.storeA.slug, createBody());
    const ip = "203.0.113.10";
    const lookup = (slug: string, turnstileToken = CAPTCHA_OK) =>
      storefront().lookup(slug, { phone: "11912345678", turnstileToken }, ip);

    await expect(lookup(fx.storeA.slug, "captcha-errado")).resolves.toEqual({
      status: 403,
      body: { error: "captcha_failed" },
    });
    const found = await lookup(fx.storeA.slug);
    expect(found.status).toBe(200);
    const body = phoneLookupResponseSchema.parse(found.body);
    if (!body.found) throw new Error("esperava encontrado");
    expect(body.masked).toEqual({
      firstName: "Maria",
      street: "Rua do Consumidor",
      neighborhood: "Centro",
    });
    expect(JSON.stringify(body.masked)).not.toMatch(/Souza|42|91234/u);

    const confirm = (slug: string) =>
      storefront().confirm(slug, { confirmToken: body.confirmToken });
    await expect(confirm(fx.storeB.slug)).resolves.toEqual({ status: 200, body: { found: false } });
    await expect(confirm(fx.storeA.slug)).resolves.toEqual({
      status: 200,
      body: {
        found: true,
        customer: { name: "Maria Souza", phone: "5511912345678" },
        address: {
          postalCode: "01310100",
          street: "Rua do Consumidor",
          number: "42",
          complement: "Apto 3",
          reference: null,
          neighborhood: "Centro",
        },
      },
    });
    await expect(confirm(fx.storeA.slug)).resolves.toEqual({ status: 200, body: { found: false } });

    // Mesma pessoa, outra Loja: nada (sem Pedido em B).
    await expect(lookup(fx.storeB.slug)).resolves.toEqual({ status: 200, body: { found: false } });
  });

  it("rate limit por IP (5 por 10 min, por Loja) e por telefone", async () => {
    const ip = "198.51.100.7";
    const lookup = (phone: string, from = ip) =>
      storefront().lookup(fx.storeA.slug, { phone, turnstileToken: CAPTCHA_OK }, from);
    const phones = ["11911110001", "11911110002", "11911110003", "11911110004", "11911110005"];
    for (const phone of phones) {
      await expect(lookup(phone)).resolves.toEqual({ status: 200, body: { found: false } });
    }
    // Mesma /24 conta como o mesmo IP.
    await expect(lookup("11911110006", "198.51.100.200")).resolves.toEqual({
      status: 429,
      body: { error: "rate_limited" },
    });

    const phone = "11922220000";
    for (let i = 0; i < 5; i += 1) {
      await expect(lookup(phone, `192.0.${i + 10}.1`)).resolves.toMatchObject({ status: 200 });
    }
    await expect(lookup(phone, "192.0.99.1")).resolves.toEqual({
      status: 429,
      body: { error: "rate_limited" },
    });
  });
});

describe("RPCs do Painel com sessão real", () => {
  it("Operador avança, cancela e pausa; configuração = forbidden sem efeito; Ops = forbidden", async () => {
    await storefront().create(fx.storeA.slug, createBody());
    await storefront().create(
      fx.storeA.slug,
      createBody({ fulfillment: "pickup", address: null, payment: { method: "on_delivery" } }),
    );
    const operator = await loginAs(fx.operatorA);
    const [delivery, pickup] = data(await orders.ordersList(operator)).orders;

    await expect(
      orders.ordersTransition(operator, {
        orderId: delivery!.id,
        from: "received",
        to: "ready_for_pickup",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      orders.ordersTransition(operator, {
        orderId: delivery!.id,
        from: "received",
        to: "preparing",
      }),
    ).resolves.toEqual({
      ok: true,
      data: { status: "preparing", next: ["out_for_delivery"], print: false },
    });
    await expect(
      orders.ordersTransition(operator, {
        orderId: delivery!.id,
        from: "received",
        to: "preparing",
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
    await expect(
      orders.ordersCancel(operator, { orderId: pickup!.id, from: "received" }),
    ).resolves.toEqual({
      ok: true,
      data: { status: "cancelled", next: [], print: false },
    });
    await expect(
      orders.ordersCancel(operator, { orderId: pickup!.id, from: "cancelled" }),
    ).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    expect(data(await orders.storeSetPause(operator, { paused: true }))).toMatchObject({
      paused: true,
      pausedBy: { role: "operator", name: "Operador A" },
    });

    const before = data(await orders.storeOperationGet(owner));
    const forbidden = { ok: false, error: "forbidden" };
    await expect(orders.storeSetHours(operator, { periods: [] })).resolves.toEqual(forbidden);
    await expect(
      orders.storeSetFulfillment(operator, {
        pickupEnabled: false,
        deliveryMode: null,
        fixedFeeCents: null,
        neighborhoods: [],
        deliveryMinimumOrderCents: null,
        deliveryEta: null,
        pickupEta: null,
      }),
    ).resolves.toEqual(forbidden);
    await expect(orders.storeSetCardBrands(operator, { debit: [], credit: [] })).resolves.toEqual(
      forbidden,
    );
    await expect(orders.storeSetPrintOnAccept(operator, { printOnAccept: true })).resolves.toEqual(
      forbidden,
    );
    expect(data(await orders.storeOperationGet(owner))).toEqual(before);

    const opsCaller = await loginAs(fx.ops);
    await expect(orders.ordersList(opsCaller)).resolves.toEqual(forbidden);
    await expect(orders.storeSetPause(opsCaller, { paused: false })).resolves.toEqual(forbidden);
  });

  it("Pedido e configuração de outra Loja não aparecem nem mudam", async () => {
    await storefront().create(fx.storeA.slug, createBody());
    const orderA = data(await orders.ordersList(owner)).orders[0]!;
    const ownerB = await loginAs(fx.ownerB);
    await expect(orders.ordersGet(ownerB, { orderId: orderA.id })).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    await expect(
      orders.ordersTransition(ownerB, { orderId: orderA.id, from: "received", to: "preparing" }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    expect(data(await orders.ordersList(ownerB)).orders).toEqual([]);
    expect(data(await orders.storeOperationGet(ownerB)).neighborhoods).toEqual([]);
    expect(data(await orders.ordersGet(owner, { orderId: orderA.id })).status).toBe("received");
  });
});

describe("rotas HTTP", () => {
  it("POST /pedidos 201 e retry 200; GET /estado 200 (relógio real, Loja aberta o dia todo)", async () => {
    const allDay = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      opensAt: "00:00",
      closesAt: "23:59",
    }));
    data(await orders.storeSetHours(owner, { periods: allDay }));
    const app = createApp();
    const testEnv = {
      ...env,
      ORDER_TOKEN_SECRET: SECRETS.orderTokenSecret,
      PHONE_LOOKUP_IP_SALT: SECRETS.phoneLookupIpSalt,
    } as Env;
    const post = (body: unknown) =>
      app.fetch(
        new Request(`https://api.foode.test/storefront/lojas/${fx.storeA.slug}/pedidos`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        testEnv,
      );
    const body = createBody({
      fulfillment: "pickup",
      address: null,
      payment: { method: "on_delivery" },
    });
    const first = await post(body);
    expect(first.status).toBe(201);
    const second = await post(body);
    expect(second.status).toBe(200);
    expect((await second.json()) as unknown).toMatchObject({ ok: true, replayed: true });

    const state = await app.fetch(
      new Request(`https://api.foode.test/storefront/lojas/${fx.storeA.slug}/estado`),
      testEnv,
    );
    expect(state.status).toBe(200);
    expect(storefrontStoreStateSchema.parse(await state.json()).name).toBe("Loja A");
  });
});
