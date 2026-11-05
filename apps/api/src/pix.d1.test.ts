// Ticket 26 no workerd com D1 (só no CI): Pedido PIX ponta a ponta com a AbacatePay fake no
// limite HTTP. Prova: PIX só com taxa Foode vigente e chaves; criação idempotente (retry não cria
// segunda cobrança); Pedido fora da fila do Painel até pagar; webhook autenticado confirma →
// Pedido pago + UM lançamento no Ledger (tarifa de serviço fora do líquido, D+1 útil);
// duplicata, reentrega e fora de ordem sem efeito duplo; expiração; isolamento entre Lojas.
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import {
  checkoutCreateResponseSchema,
  type CheckoutCreateRequestInput,
  orderTrackingSchema,
  storefrontStoreStateSchema,
} from "@foode/shared/order";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import type { EmailSender } from "./email/sender";
import { createMenuService } from "./menu-service";
import { createOrderService, type OrderService } from "./order-service";
import { abacatePayFromEnv, createPixService, type PixService } from "./pix-service";
import { signAbacatePayBody } from "./providers/abacatepay/webhook";
import { createStorefrontService } from "./storefront-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
const SECRETS = {
  orderTokenSecret: "segredo-de-teste-do-token-do-pedido",
  phoneLookupIpSalt: "sal-de-teste-do-ip-da-busca",
};
const ABACATEPAY = {
  ABACATEPAY_API_KEY: "abc_teste",
  ABACATEPAY_WEBHOOK_SECRET: "segredo-webhook-teste",
  ABACATEPAY_SIGNING_KEY: "chave-publica-teste",
};
// Quinta-feira, 12:00 em São Paulo.
const OPEN_NOW = new Date("2026-11-05T15:00:00.000Z");
const PNG = "data:image/png;base64,iVBORw0KGgo=";

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let orders: OrderService;
let owner: PainelCaller;
let ownerB: PainelCaller;
let itemId: string;
let itemIdB: string;
let now: Date;
/** Cobranças criadas no fake da AbacatePay: id → valor. */
let charges: Map<string, { amount: number; intentId: string }>;
let checkStatus: string;
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
  await auth.handler(authRequest("/reset-password", { token, newPassword: PASSWORD }));
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

/** Retirada aberta na quinta 11–15h e um item de R$ 25,90. */
async function configureStore(caller: PainelCaller): Promise<string> {
  data(
    await orders.storeSetHours(caller, {
      periods: [{ weekday: 4, opensAt: "11:00", closesAt: "15:00" }],
    }),
  );
  data(
    await orders.storeSetFulfillment(caller, {
      pickupEnabled: true,
      deliveryMode: null,
      fixedFeeCents: null,
      neighborhoods: [],
      deliveryMinimumOrderCents: null,
      deliveryEta: null,
      pickupEta: { minMinutes: 15, maxMinutes: 20 },
    }),
  );
  const menu = createMenuService({ db, auth, media: env.MEDIA, mediaBaseUrl: null });
  const { categoryId } = data(await menu.menuCreateCategory(caller, { name: "Lanches" }));
  return data(await menu.menuCreateItem(caller, { categoryId, name: "X-Burger", priceCents: 2590 }))
    .itemId;
}

/** AbacatePay fake no limite HTTP (Turnstile segue o fake do 24a). */
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  if (url === TURNSTILE_SITEVERIFY_URL) return Response.json({ success: true });
  if (url === "https://api.abacatepay.com/v2/transparents/create") {
    const body = JSON.parse(String(init?.body)) as {
      data: { amount: number; expiresIn: number; metadata: { intentId: string } };
    };
    const id = `pix_char_${crypto.randomUUID().replaceAll("-", "")}`;
    charges.set(id, { amount: body.data.amount, intentId: body.data.metadata.intentId });
    return Response.json({
      success: true,
      error: null,
      data: {
        id,
        amount: body.data.amount,
        status: "PENDING",
        devMode: true,
        brCode: `000201-${id}`,
        brCodeBase64: PNG,
        platformFee: 54,
        expiresAt: new Date(now.getTime() + body.data.expiresIn * 1000).toISOString(),
        metadata: body.data.metadata,
      },
    });
  }
  if (url.startsWith("https://api.abacatepay.com/v2/transparents/check")) {
    return Response.json({ success: true, error: null, data: { status: checkStatus } });
  }
  return realFetch(input, init);
}

function pixService(keys = ABACATEPAY): PixService {
  return createPixService({
    db,
    provider: abacatePayFromEnv(keys, (url, init) => globalThis.fetch(url, init)),
    now: () => now,
  });
}

function storefront(pix: PixService | null = pixService()) {
  return createStorefrontService({
    db,
    turnstile: { verify: async () => true },
    ...SECRETS,
    pix,
    now: () => now,
  });
}

function pixBody(item = itemId, overrides: Partial<CheckoutCreateRequestInput> = {}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    lines: [{ itemId: item, quantity: 2, complementSelections: {}, additionalIds: [] }],
    fulfillment: "pickup",
    customer: { name: "Maria Souza", phone: "(11) 91234-5678" },
    payment: { method: "pix" },
    note: null,
    ...overrides,
  } satisfies CheckoutCreateRequestInput;
}

async function createPix(slug: string, body = pixBody()) {
  const reply = await storefront().create(slug, body);
  const parsed = checkoutCreateResponseSchema.parse(reply.body);
  if (!parsed.ok) throw new Error(`esperava ok: ${JSON.stringify(parsed.error)}`);
  return { reply, created: parsed };
}

async function track(slug: string, token: string, pix = pixService()) {
  const reply = await storefront(pix).track(slug, token);
  return orderTrackingSchema.parse(reply.body);
}

async function webhookFor(
  chargeId: string,
  eventId = `log_${crypto.randomUUID()}`,
  amount?: number,
) {
  const charge = charges.get(chargeId)!;
  const rawBody = JSON.stringify({
    id: eventId,
    event: "transparent.completed",
    apiVersion: 2,
    devMode: true,
    data: {
      transparent: {
        id: chargeId,
        amount: amount ?? charge.amount,
        status: "PAID",
        method: "PIX",
        platformFee: 54,
        metadata: { intentId: charge.intentId },
      },
    },
  });
  return {
    rawBody,
    querySecret: ABACATEPAY.ABACATEPAY_WEBHOOK_SECRET,
    signature: await signAbacatePayBody(rawBody, ABACATEPAY.ABACATEPAY_SIGNING_KEY),
  };
}

async function ledgerCount(storeId: string): Promise<number> {
  return (await db.payments.paymentsOfStore(storeId)).ledger.length;
}

beforeEach(async () => {
  now = OPEN_NOW;
  charges = new Map();
  checkStatus = "PENDING";
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  orders = createOrderService({ db, auth, orderTokenSecret: SECRETS.orderTokenSecret });
  vi.spyOn(globalThis, "fetch").mockImplementation(fakeFetch);
  const ops = db.ops((await db.access.opsContext(fx.ops.id))!);
  await ops.updateStore(fx.storeA.id, storeProfileFixture());
  await ops.updateStore(fx.storeB.id, storeProfileFixture());
  owner = await loginAs(fx.ownerA);
  ownerB = await loginAs(fx.ownerB);
  itemId = await configureStore(owner);
  itemIdB = await configureStore(ownerB);
  // Taxa PIX só da Loja A (0,99%); a B fica sem taxa vigente.
  await ops.createPaymentFees(fx.storeA.id, [
    {
      method: "pix",
      cardMode: null,
      percentBps: 99,
      fixedCents: 0,
      validFrom: "2020-01-01T00:00:00.000Z",
      validTo: null,
    },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("disponibilidade (decisões 61 e 63)", () => {
  it("PIX só com taxa Foode vigente E chaves; ordem neutra junto dos demais meios", async () => {
    const state = storefrontStoreStateSchema.parse((await storefront().state(fx.storeA.slug)).body);
    expect(state.paymentMethods).toEqual(["pix", "on_delivery"]);
    const withoutKeys = storefrontStoreStateSchema.parse(
      (await storefront(null).state(fx.storeA.slug)).body,
    );
    expect(withoutKeys.paymentMethods).toEqual(["on_delivery"]);
    const noFee = storefrontStoreStateSchema.parse((await storefront().state(fx.storeB.slug)).body);
    expect(noFee.paymentMethods).toEqual(["on_delivery"]);
    await expect(storefront().create(fx.storeB.slug, pixBody(itemIdB))).resolves.toMatchObject({
      status: 422,
      body: { ok: false, error: { code: "payment_method_unavailable" } },
    });
    await expect(storefront(null).create(fx.storeA.slug, pixBody())).resolves.toMatchObject({
      status: 422,
    });
  });
});

describe("criação idempotente e página do Pedido", () => {
  it("cria a cobrança uma vez, com tarifa de serviço; retry devolve o mesmo Pedido e QR", async () => {
    const body = pixBody();
    const { reply, created } = await createPix(fx.storeA.slug, body);
    expect(reply.status).toBe(201);
    expect(charges.size).toBe(1);
    const [charge] = [...charges.values()];
    expect(charge?.amount).toBe(5180 + 150);

    const retry = await storefront().create(fx.storeA.slug, body);
    expect(retry).toMatchObject({ status: 200, body: { ok: true, replayed: true } });
    expect(charges.size).toBe(1);

    const page = await track(fx.storeA.slug, created.accessToken);
    expect(page).toMatchObject({
      totalCents: 5180,
      serviceFeeCents: 150,
      payment: { method: "pix" },
      pix: { state: "pending", amountCents: 5330, qrCodeDataUrl: PNG },
    });
    expect(page.pix?.copyPaste).toMatch(/^000201-pix_char_/u);
    expect(JSON.stringify(page)).not.toContain("platformFee");

    // Fora da fila do Painel enquanto aguarda pagamento.
    expect(data(await orders.ordersList(owner)).orders).toHaveLength(0);
  });
});

describe("webhook → Pedido pago → Ledger", () => {
  it("confirma uma vez: duplicata, reentrega e consulta depois não duplicam", async () => {
    const { created } = await createPix(fx.storeA.slug);
    const [chargeId] = [...charges.keys()];
    const pix = pixService();
    const event = await webhookFor(chargeId!, "log_evento_1");
    await expect(pix.handleWebhook(event)).resolves.toMatchObject({
      status: 200,
      body: { outcome: "applied" },
    });
    await expect(pix.handleWebhook(event)).resolves.toMatchObject({
      body: { outcome: "duplicate" },
    });
    // Outro evento do mesmo pagamento (fora de ordem/reenvio com id novo): sem efeito.
    await expect(
      pix.handleWebhook(await webhookFor(chargeId!, "log_evento_2")),
    ).resolves.toMatchObject({ body: { outcome: "already_applied" } });
    // Consulta autenticada depois do webhook: nada muda.
    checkStatus = "PAID";
    now = new Date(OPEN_NOW.getTime() + 2 * 60_000);
    const page = await track(fx.storeA.slug, created.accessToken, pix);
    expect(page.pix).toMatchObject({ state: "paid", copyPaste: null });

    expect(await ledgerCount(fx.storeA.id)).toBe(1);
    const rows = await db.payments.paymentsOfStore(fx.storeA.id);
    const [entry] = await db.payments.ledgerOfIntent(rows.intents[0]!.id);
    expect(entry).toMatchObject({
      chargedCents: 5330,
      orderTotalCents: 5180,
      serviceFeeCents: 150,
      foodeFeeCents: 51,
      providerCostCents: 54,
      netCents: 5129,
      releaseDate: "2026-11-05",
      expectedPayoutDate: "2026-11-06",
      custody: "pilot_platform",
      provider: "abacatepay",
      method: "pix",
    });

    // Pago: entra na fila do Painel com a tarifa como item da Foode no detalhe.
    const queue = data(await orders.ordersList(owner)).orders;
    expect(queue).toHaveLength(1);
    const detail = data(await orders.ordersGet(owner, { orderId: queue[0]!.id }));
    expect(detail).toMatchObject({ totalCents: 5180, serviceFeeCents: 150 });
    expect(rows.outcomes).toEqual(["applied", "already_applied"]);
  });

  it("valor divergente ou assinatura inválida não confirmam", async () => {
    await createPix(fx.storeA.slug);
    const [chargeId] = [...charges.keys()];
    const pix = pixService();
    await expect(pix.handleWebhook(await webhookFor(chargeId!, "log_x", 1))).resolves.toMatchObject(
      {
        body: { outcome: "amount_mismatch" },
      },
    );
    const forged = await webhookFor(chargeId!, "log_y");
    await expect(
      pix.handleWebhook({ ...forged, signature: forged.signature.slice(1) }),
    ).resolves.toMatchObject({ status: 401 });
    expect(await ledgerCount(fx.storeA.id)).toBe(0);
    expect(data(await orders.ordersList(owner)).orders).toHaveLength(0);
  });

  it("pagamento que chega depois de expirar ainda é aceito (o dinheiro entrou)", async () => {
    const { created } = await createPix(fx.storeA.slug);
    const [chargeId] = [...charges.keys()];
    now = new Date(OPEN_NOW.getTime() + 31 * 60_000);
    checkStatus = "EXPIRED";
    expect((await track(fx.storeA.slug, created.accessToken)).pix).toMatchObject({
      state: "expired",
      copyPaste: null,
    });
    await pixService().handleWebhook(await webhookFor(chargeId!));
    expect((await track(fx.storeA.slug, created.accessToken)).pix?.state).toBe("paid");
    expect(await ledgerCount(fx.storeA.id)).toBe(1);
  });
});

describe("isolamento entre Lojas", () => {
  it("pagamento da Loja A não aparece no Painel nem no Ledger da Loja B", async () => {
    await createPix(fx.storeA.slug);
    const [chargeId] = [...charges.keys()];
    await pixService().handleWebhook(await webhookFor(chargeId!));
    expect(data(await orders.ordersList(owner)).orders).toHaveLength(1);
    expect(data(await orders.ordersList(ownerB)).orders).toHaveLength(0);
    expect(await ledgerCount(fx.storeB.id)).toBe(0);
  });
});

describe("rota HTTP do webhook", () => {
  it("segredo errado = 401 sem corpo de volta; evento fora do escopo = 200", async () => {
    const post = (query: string, rawBody: string, signature: string) =>
      exports.default.fetch(
        new Request(`https://api.foode.test/webhooks/abacatepay${query}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-webhook-signature": signature },
          body: rawBody,
        }),
      );
    const rawBody = JSON.stringify({ id: "log_t", event: "transfer.completed", data: {} });
    const signature = await signAbacatePayBody(rawBody, ABACATEPAY.ABACATEPAY_SIGNING_KEY);
    const denied = await post("?webhookSecret=errado", rawBody, signature);
    expect(denied.status).toBe(401);
    expect(await denied.text()).not.toContain("transfer");
    const ok = await post(
      `?webhookSecret=${ABACATEPAY.ABACATEPAY_WEBHOOK_SECRET}`,
      rawBody,
      signature,
    );
    expect(ok.status).toBe(200);
  });
});
