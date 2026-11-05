// Ticket 28 (pendência) no workerd com D1 (só no CI): criar um Pedido pelo Storefront soma a etapa
// `order` no funil da Loja (dia civil de São Paulo do relógio do checkout), não soma na outra Loja
// e o retry com a mesma chave de idempotência (replay) não soma de novo. Fixture "app com duas
// Lojas" (@foode/db/testing); a Loja é configurada pelas RPCs do Dono.
import { env } from "cloudflare:test";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import { funnelDay } from "@foode/shared/onboarding";
import type { CheckoutCreateRequestInput } from "@foode/shared/order";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import type { EmailSender } from "./email/sender";
import { mediaBaseUrl } from "./media";
import { createMenuService } from "./menu-service";
import { createOnboardingService, type OnboardingService } from "./onboarding-service";
import { createOrderService, type OrderService } from "./order-service";
import { createStorefrontService } from "./storefront-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
// Quinta-feira, 12:00 em São Paulo (dentro do horário configurado abaixo).
const OPEN_NOW = new Date("2026-11-05T15:00:00.000Z");
const DAY = funnelDay(OPEN_NOW.getTime());

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let orders: OrderService;
let onboarding: OnboardingService;
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

const storefront = () =>
  createStorefrontService({
    db,
    turnstile: { verify: async (token) => token === CAPTCHA_OK },
    orderTokenSecret: "segredo-de-teste-do-token-do-pedido",
    phoneLookupIpSalt: "sal-de-teste-do-ip-da-busca",
    now: () => OPEN_NOW,
  });

/** Loja aberta na quinta, Retirada habilitada e um item no cardápio. */
async function configureStore(caller: PainelCaller): Promise<string> {
  data(
    await orders.storeSetHours(caller, {
      periods: [{ weekday: 4, opensAt: "11:00", closesAt: "15:00" }],
    }),
  );
  data(
    await orders.storeSetFulfillment(caller, {
      pickupEnabled: true,
      deliveryMode: "neighborhood",
      fixedFeeCents: null,
      neighborhoods: [{ name: "Centro", feeCents: 500, active: true }],
      deliveryMinimumOrderCents: null,
      deliveryEta: { minMinutes: 40, maxMinutes: 60 },
      pickupEta: { minMinutes: 15, maxMinutes: 20 },
    }),
  );
  const menu = createMenuService({ db, auth, media: env.MEDIA, mediaBaseUrl: null });
  const { categoryId } = data(await menu.menuCreateCategory(caller, { name: "Lanches" }));
  const { itemId } = data(
    await menu.menuCreateItem(caller, { categoryId, name: "X-Burger", priceCents: 2590 }),
  );
  return itemId;
}

function pickupBody(itemId: string): CheckoutCreateRequestInput {
  return {
    idempotencyKey: crypto.randomUUID(),
    lines: [{ itemId, quantity: 1, complementSelections: {}, additionalIds: [] }],
    fulfillment: "pickup",
    customer: { name: "Maria Souza", phone: "(11) 91234-5678" },
    payment: { method: "on_delivery", changeForCents: null },
    note: null,
  };
}

async function ordersInFunnel(caller: PainelCaller): Promise<number> {
  return data(await onboarding.funnelReport(caller, { from: DAY, to: DAY })).totals.order;
}

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  orders = createOrderService({ db, auth, orderTokenSecret: undefined });
  onboarding = createOnboardingService({
    db,
    auth,
    media: env.MEDIA,
    mediaBaseUrl: mediaBaseUrl("https://api.foode.test/media"),
  });
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

describe("funil: etapa order pelo checkout do Storefront", () => {
  it("Pedido criado soma 1 só na sua Loja; retry com a mesma chave não soma de novo", async () => {
    const ownerA = await loginAs(fx.ownerA);
    const ownerB = await loginAs(fx.ownerB);
    const itemId = await configureStore(ownerA);
    expect(await ordersInFunnel(ownerA)).toBe(0);
    expect(await ordersInFunnel(ownerB)).toBe(0);

    const body = pickupBody(itemId);
    expect((await storefront().create(fx.storeA.slug, body)).status).toBe(201);
    expect(await ordersInFunnel(ownerA)).toBe(1);
    expect(await ordersInFunnel(ownerB)).toBe(0);

    // Replay (mesma chave e corpo) devolve o mesmo Pedido e não conta outra vez.
    expect((await storefront().create(fx.storeA.slug, body)).status).toBe(200);
    expect(await ordersInFunnel(ownerA)).toBe(1);

    // Outro Pedido (chave nova) soma.
    expect((await storefront().create(fx.storeA.slug, pickupBody(itemId))).status).toBe(201);
    expect(await ordersInFunnel(ownerA)).toBe(2);
    expect(await ordersInFunnel(ownerB)).toBe(0);
  });
});
