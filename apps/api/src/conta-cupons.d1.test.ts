// Ticket 13 no workerd com D1 (só no CI): login do Consumidor por código no WhatsApp (whatsmiau
// fake no limite do remetente; expiração, 5 tentativas, reenvio em 30 s, uso único), cadastro com
// CPF (unicidade de telefone e CPF, conflito sem dados da outra conta), vínculo de Pedidos Guest só
// na mesma Loja, busca por telefone com conta (decisão 68), troca de telefone pelo Ops, Cupons
// (RBAC, isolamento entre Lojas, data, dia da semana, teto, mínimo, limite sob concorrência) e o
// Cupom de boas-vindas de primeira compra por Loja (decisão 66).
import { env } from "cloudflare:test";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import { checkoutCreateResponseSchema, type CheckoutCreateRequestInput } from "@foode/shared/order";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import { createCouponService, type CouponService } from "./coupon-service";
import {
  createCustomerService,
  createOpsCustomerService,
  type CustomerReply,
  type CustomerService,
} from "./customer-service";
import type { EmailSender } from "./email/sender";
import { createMenuService } from "./menu-service";
import { createOrderService, type OrderService } from "./order-service";
import { createStorefrontService } from "./storefront-service";
import type { WhatsAppSender } from "./whatsapp/whatsmiau";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
const SECRETS = {
  orderTokenSecret: "segredo-de-teste-do-token-do-pedido",
  phoneLookupIpSalt: "sal-de-teste-do-ip-da-busca",
  codeSecret: "segredo-de-teste-do-codigo-de-login",
};
// Quinta-feira, 12:00 em São Paulo.
const OPEN_NOW = new Date("2026-11-05T15:00:00.000Z");
// O D1 do Miniflare é um só por arquivo (o seed usa ids aleatórios): CPF fixo colide entre testes
// pela unicidade de CPF. Cada teste sorteia os seus no beforeEach.
let CPF_A: string;
let CPF_B: string;

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let orders: OrderService;
let coupons: CouponService;
let ownerA: PainelCaller;
let ownerB: PainelCaller;
let idsA: { itemId: string; centroId: string };
let idsB: { itemId: string; centroId: string };
let sent: { to: string; text: string }[];
let sendOk: boolean;
const realFetch = globalThis.fetch;

function randomIp(): string {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

function randomPhone(): string {
  return `119${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

function cpfCheckDigit(digits: string): number {
  const sum = [...digits].reduce(
    (acc, digit, index) => acc + Number(digit) * (digits.length + 1 - index),
    0,
  );
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

function randomCpf(): string {
  const base = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  if (/^(\d)\1+$/u.test(base)) return randomCpf();
  const first = cpfCheckDigit(base);
  return `${base}${first}${cpfCheckDigit(`${base}${first}`)}`;
}

function formatCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function maskCpf(cpf: string): string {
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

function e164(phone: string): string {
  return `55${phone}`;
}

function data<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`esperava ok, veio ${result.error}`);
  return result.data;
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

const whatsapp: WhatsAppSender = {
  async sendText(to, text) {
    if (!sendOk) return { ok: false, reason: "unavailable" };
    sent.push({ to, text });
    return { ok: true };
  },
};

function customer(now: Date = OPEN_NOW): CustomerService {
  return createCustomerService({
    db,
    turnstile: { verify: async (token) => token === CAPTCHA_OK },
    whatsapp,
    codeSecret: SECRETS.codeSecret,
    ipSalt: SECRETS.phoneLookupIpSalt,
    orderTokenSecret: SECRETS.orderTokenSecret,
    now: () => now,
  });
}

function storefront(now: Date = OPEN_NOW) {
  return createStorefrontService({
    db,
    turnstile: { verify: async (token) => token === CAPTCHA_OK },
    orderTokenSecret: SECRETS.orderTokenSecret,
    phoneLookupIpSalt: SECRETS.phoneLookupIpSalt,
    customerSessionOf: async (cookie) =>
      (await customer(now).currentSession(cookie))?.session ?? null,
    now: () => now,
  });
}

function cookieOf(reply: CustomerReply<unknown>): string {
  expect(reply.setCookie).toBeTruthy();
  return reply.setCookie!.split(";")[0]!;
}

function lastCode(): string {
  const message = sent.at(-1)!.text;
  expect(message).toMatch(/^\d{4} é o seu código de acesso ao Foode Delivery\.$/u);
  return message.slice(0, 4);
}

function wrongCode(code: string): string {
  return String((Number(code) + 1) % 10_000).padStart(4, "0");
}

async function requestCode(phone: string, now: Date = OPEN_NOW) {
  return customer(now).requestCode({ phone, turnstileToken: CAPTCHA_OK }, randomIp());
}

async function verify(phone: string, code: string, now: Date = OPEN_NOW) {
  return customer(now).verifyCode({ phone, code, turnstileToken: CAPTCHA_OK }, randomIp());
}

/** Código + (se preciso) cadastro: devolve o cookie da sessão com conta. */
async function signIn(phone: string, cpf?: string): Promise<string> {
  expect((await requestCode(phone)).status).toBe(200);
  const verified = await verify(phone, lastCode());
  expect(verified.status).toBe(200);
  const cookie = cookieOf(verified);
  if ((verified.body as { status: string }).status === "signup_required") {
    const signup = await customer().signup({ name: "Maria Souza", cpf }, cookie, randomIp());
    expect(signup.status).toBe(201);
  }
  return cookie;
}

async function configureStore(caller: PainelCaller) {
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
  const settings = data(await orders.storeOperationGet(caller));
  return { itemId, centroId: settings.neighborhoods.find((n) => n.name === "Centro")!.id };
}

function createBody(
  ids: { itemId: string; centroId: string },
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
      complement: null,
      reference: null,
      neighborhoodId: ids.centroId,
    },
    customer: { name: "Maria Souza", phone: "(11) 91234-5678" },
    payment: { method: "on_delivery", changeForCents: null },
    note: null,
    ...overrides,
  };
}

function quoteBody(ids: { itemId: string; centroId: string }, couponCode?: string) {
  return {
    lines: [{ itemId: ids.itemId, quantity: 2, complementSelections: {}, additionalIds: [] }],
    fulfillment: "delivery" as const,
    address: { street: "Rua", number: "1", neighborhoodId: ids.centroId },
    ...(couponCode ? { couponCode } : {}),
  };
}

beforeEach(async () => {
  CPF_A = randomCpf();
  CPF_B = randomCpf();
  while (CPF_B === CPF_A) CPF_B = randomCpf();
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  sent = [];
  sendOk = true;
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  orders = createOrderService({ db, auth, orderTokenSecret: SECRETS.orderTokenSecret });
  coupons = createCouponService({ db, auth, now: () => OPEN_NOW });
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
  ownerA = await loginAs(fx.ownerA);
  ownerB = await loginAs(fx.ownerB);
  idsA = await configureStore(ownerA);
  idsB = await configureStore(ownerB);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("código no WhatsApp", () => {
  it("mensagem exata, uso único e resposta igual com ou sem conta", async () => {
    const phone = randomPhone();
    const request = await requestCode(phone);
    expect(request).toEqual({
      status: 200,
      body: { ok: true, expiresInSeconds: 300, resendAfterSeconds: 30 },
    });
    expect(sent.at(-1)!.to).toBe(e164(phone));
    const code = lastCode();
    const verified = await verify(phone, code);
    expect(verified.body).toEqual({ ok: true, status: "signup_required" });
    expect(verified.setCookie).toContain("HttpOnly; Secure; SameSite=Lax");
    // Usado: precisa de outro código.
    await expect(verify(phone, code)).resolves.toMatchObject({
      status: 422,
      body: { error: "code_expired" },
    });

    // Telefone com conta recebe a MESMA resposta no pedido de código.
    await customer().signup({ name: "Maria", cpf: CPF_A }, cookieOf(verified), randomIp());
    const later = new Date(OPEN_NOW.getTime() + 31_000);
    expect(await requestCode(phone, later)).toEqual(request);
  });

  it("reenvio só depois de 30 s; o código novo substitui o anterior", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const first = lastCode();
    await expect(requestCode(phone, new Date(OPEN_NOW.getTime() + 10_000))).resolves.toEqual({
      status: 429,
      body: { error: "resend_too_soon", retryAfterSeconds: 20 },
    });
    const later = new Date(OPEN_NOW.getTime() + 31_000);
    expect((await requestCode(phone, later)).status).toBe(200);
    const second = lastCode();
    if (first !== second) {
      await expect(verify(phone, first, later)).resolves.toMatchObject({
        body: { error: "code_invalid" },
      });
    }
    await expect(verify(phone, second, later)).resolves.toMatchObject({ status: 200 });
  });

  it("expira em 5 minutos", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const expired = new Date(OPEN_NOW.getTime() + 301_000);
    await expect(verify(phone, lastCode(), expired)).resolves.toEqual({
      status: 422,
      body: { error: "code_expired" },
    });
  });

  it("5 tentativas: depois disso nem o código certo entra", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const code = lastCode();
    for (let left = 4; left >= 0; left -= 1) {
      await expect(verify(phone, wrongCode(code))).resolves.toEqual({
        status: 422,
        body: { error: "code_invalid", attemptsLeft: left },
      });
    }
    await expect(verify(phone, code)).resolves.toEqual({
      status: 422,
      body: { error: "code_attempts_exhausted" },
    });
  });

  it("tentativas concorrentes não passam de 5 nem usam o código duas vezes", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const code = lastCode();
    const replies = await Promise.all(Array.from({ length: 4 }, () => verify(phone, code)));
    expect(replies.filter((reply) => reply.status === 200)).toHaveLength(1);
  });

  it("Turnstile, rate limit por telefone e falha de envio controlada", async () => {
    const phone = randomPhone();
    await expect(
      customer().requestCode({ phone, turnstileToken: "errado" }, randomIp()),
    ).resolves.toEqual({ status: 403, body: { error: "captcha_failed" } });
    sendOk = false;
    await expect(requestCode(phone)).resolves.toEqual({
      status: 503,
      body: { error: "login_unavailable" },
    });
    sendOk = true;
    // Falha de envio não segura o reenvio (o código some); o 4º pedido em 5 min é barrado.
    await expect(requestCode(phone)).resolves.toMatchObject({ status: 200 });
    const later = new Date(OPEN_NOW.getTime() + 60_000);
    await expect(requestCode(phone, later)).resolves.toEqual({
      status: 429,
      body: { error: "rate_limited" },
    });
  });
});

describe("conta: cadastro, unicidade e sessão", () => {
  it("CPF validado, telefone e CPF únicos, conflito sem dados da outra conta", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const cookie = cookieOf(await verify(phone, lastCode()));
    const wrongCpf = formatCpf(`${CPF_A.slice(0, 10)}${(Number(CPF_A[10]) + 1) % 10}`);
    await expect(
      customer().signup({ name: "Maria", cpf: wrongCpf }, cookie, randomIp()),
    ).resolves.toMatchObject({ status: 400 });
    const created = await customer().signup(
      { name: "Maria", cpf: formatCpf(CPF_A) },
      cookie,
      randomIp(),
    );
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      state: "signed_in",
      account: {
        name: "Maria",
        phone: e164(phone),
        cpfMasked: maskCpf(CPF_A),
        lastAddress: null,
      },
    });
    expect(JSON.stringify(created.body)).not.toContain(CPF_A);

    // Outro telefone com o mesmo CPF: bloqueado, sem dizer de quem é.
    const other = randomPhone();
    await requestCode(other);
    const otherCookie = cookieOf(await verify(other, lastCode()));
    const conflict = await customer().signup({ name: "João", cpf: CPF_A }, otherCookie, randomIp());
    expect(conflict).toEqual({ status: 409, body: { error: "account_conflict" } });
    await expect(customer().state(otherCookie)).resolves.toMatchObject({
      body: { state: "signup_required", phone: e164(other) },
    });

    // O mesmo telefone volta direto para a conta (um telefone = uma conta).
    const again = new Date(OPEN_NOW.getTime() + 31_000);
    await requestCode(phone, again);
    await expect(verify(phone, lastCode(), again)).resolves.toMatchObject({
      body: { status: "signed_in" },
    });

    // Sair apaga a sessão.
    await expect(customer().signOut(cookie)).resolves.toMatchObject({ status: 204 });
    await expect(customer().state(cookie)).resolves.toMatchObject({ body: { state: "anonymous" } });
    await expect(customer().orders(fx.storeA.slug, cookie)).resolves.toEqual({
      status: 401,
      body: { error: "unauthenticated" },
    });
  });

  it("Guest continua sem conta e o login não afeta o checkout Guest", async () => {
    const reply = await storefront().create(fx.storeA.slug, createBody(idsA));
    expect(reply.status).toBe(201);
  });
});

describe("vínculo de Pedidos pelo telefone verificado, só na mesma Loja", () => {
  it("Guest da Loja A aparece só na A; Pedido autenticado já nasce ligado", async () => {
    const phone = randomPhone();
    const guest = { name: "Maria Souza", phone };
    expect(
      (await storefront().create(fx.storeA.slug, createBody(idsA, { customer: guest }))).status,
    ).toBe(201);
    expect(
      (await storefront().create(fx.storeB.slug, createBody(idsB, { customer: guest }))).status,
    ).toBe(201);
    // Pedido de outro telefone na A nunca aparece.
    expect((await storefront().create(fx.storeA.slug, createBody(idsA))).status).toBe(201);

    const cookie = await signIn(phone, CPF_A);
    const inA = await customer().orders(fx.storeA.slug, cookie);
    expect(inA.status).toBe(200);
    const listA = (inA.body as { orders: { code: number; trackingPath: string }[] }).orders;
    expect(listA).toHaveLength(1);
    expect(listA[0]!.trackingPath.startsWith(`/loja/${fx.storeA.slug}/pedido/`)).toBe(true);
    const inB = await customer().orders(fx.storeB.slug, cookie);
    expect((inB.body as { orders: unknown[] }).orders).toHaveLength(1);
    await expect(customer().orders("loja-inexistente", cookie)).resolves.toMatchObject({
      status: 404,
    });

    // Autenticado com outro telefone no formulário: ainda assim é da conta.
    const created = await storefront().create(fx.storeA.slug, createBody(idsA), cookie);
    expect(created.status).toBe(201);
    const after = await customer().orders(fx.storeA.slug, cookie);
    expect((after.body as { orders: unknown[] }).orders).toHaveLength(2);
    // Último endereço usado vem da conta (decisão 68).
    await expect(customer().state(cookie)).resolves.toMatchObject({
      body: { account: { lastAddress: { street: "Rua do Consumidor", number: "42" } } },
    });
  });

  it("busca por telefone com conta só sinaliza 'Entrar com WhatsApp' (decisão 68)", async () => {
    const phone = randomPhone();
    await storefront().create(
      fx.storeA.slug,
      createBody(idsA, { customer: { name: "Ana", phone } }),
    );
    await signIn(phone, CPF_A);
    const lookup = await storefront().lookup(
      fx.storeA.slug,
      { phone, turnstileToken: CAPTCHA_OK },
      randomIp(),
    );
    expect(lookup).toEqual({ status: 200, body: { found: false, hasAccount: true } });
    expect(JSON.stringify(lookup.body)).not.toContain("Ana");
  });
});

describe("troca de telefone pelo Ops", () => {
  it("só Ops; número de outra conta = conflict; sessões caem; histórico fica na conta", async () => {
    const phone = randomPhone();
    await storefront().create(
      fx.storeA.slug,
      createBody(idsA, { customer: { name: "Bia", phone } }),
    );
    const cookie = await signIn(phone, CPF_A);
    const otherPhone = randomPhone();
    await signIn(otherPhone, CPF_B);

    const service = createOpsCustomerService({ db, auth });
    const ops = await loginAs(fx.ops);
    await expect(service.opsCustomerFind(ownerA, { cpf: CPF_A })).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    const found = data(await service.opsCustomerFind(ops, { cpf: CPF_A }));
    expect(found).toMatchObject({ phone: e164(phone), cpfMasked: maskCpf(CPF_A) });
    await expect(
      service.opsCustomerChangePhone(ops, { accountId: found.accountId, phone: otherPhone }),
    ).resolves.toEqual({ ok: false, error: "conflict" });

    const newPhone = randomPhone();
    data(
      await service.opsCustomerChangePhone(ops, { accountId: found.accountId, phone: newPhone }),
    );
    await expect(customer().state(cookie)).resolves.toMatchObject({ body: { state: "anonymous" } });
    expect(data(await service.opsCustomerFind(ops, { phone: newPhone })).accountId).toBe(
      found.accountId,
    );
    const fresh = await signIn(newPhone);
    const list = await customer().orders(fx.storeA.slug, fresh);
    expect((list.body as { orders: unknown[] }).orders).toHaveLength(1);
  });
});

describe("Cupons no Painel", () => {
  it("só o Dono; código único por Loja; isolamento entre Lojas", async () => {
    const operator = await loginAs(fx.operatorA);
    const input = { code: "ganhe5", kind: "fixed" as const, amountCents: 500 };
    await expect(coupons.couponsGet(operator)).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(coupons.couponCreate(operator, input)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    const { couponId } = data(await coupons.couponCreate(ownerA, input));
    await expect(coupons.couponCreate(ownerA, input)).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    data(await coupons.couponCreate(ownerB, input));
    await expect(coupons.couponSetActive(ownerB, { couponId, active: false })).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    const overviewA = data(await coupons.couponsGet(ownerA));
    expect(overviewA.coupons).toHaveLength(1);
    expect(overviewA.coupons[0]).toMatchObject({ code: "GANHE5", status: "active", usedCount: 0 });
    expect(overviewA.welcome).toEqual({
      active: false,
      discount: null,
      minOrderCents: null,
      redeemedCount: 0,
    });
    expect(overviewA.templates.length).toBeGreaterThanOrEqual(2);
    data(await coupons.couponSetActive(ownerA, { couponId, active: false }));
    expect(data(await coupons.couponsGet(ownerA)).coupons[0]!.status).toBe("inactive");
    data(await coupons.couponDelete(ownerA, { couponId }));
    expect(data(await coupons.couponsGet(ownerA)).coupons).toHaveLength(0);
  });
});

describe("Cupom no checkout", () => {
  it("teto do %, fora da taxa de Delivery, e um erro específico por motivo", async () => {
    data(
      await coupons.couponCreate(ownerA, {
        code: "DEZ",
        kind: "percent",
        percent: 10,
        maxDiscountCents: 200,
      }),
    );
    const quote = await storefront().quote(fx.storeA.slug, quoteBody(idsA, "dez"));
    expect(quote.body).toMatchObject({
      ok: true,
      subtotalCents: 5180,
      deliveryFeeCents: 500,
      discountCents: 200,
      totalCents: 5480,
      coupon: { source: "promo", code: "DEZ", discountCents: 200 },
    });

    const reasons: Array<[Record<string, unknown>, string]> = [
      [{ code: "SABADO", kind: "fixed", amountCents: 100, weekdays: [6] }, "not_today"],
      [{ code: "ONTEM", kind: "fixed", amountCents: 100, endsOn: "2026-11-04" }, "expired"],
      [{ code: "LOGO", kind: "fixed", amountCents: 100, startsOn: "2026-11-06" }, "not_started"],
      [{ code: "MINIMO", kind: "fixed", amountCents: 100, minOrderCents: 9000 }, "below_minimum"],
      [{ code: "DESLIGADO", kind: "fixed", amountCents: 100, active: false }, "not_found"],
    ];
    for (const [input, reason] of reasons) {
      data(await coupons.couponCreate(ownerA, input as never));
      const reply = await storefront().quote(fx.storeA.slug, quoteBody(idsA, String(input.code)));
      expect(reply.body).toMatchObject({ ok: false, error: { code: "coupon_invalid", reason } });
    }
    await expect(
      storefront().quote(fx.storeA.slug, quoteBody(idsA, "NAOEXISTE")),
    ).resolves.toMatchObject({
      body: { ok: false, error: { code: "coupon_invalid", reason: "not_found" } },
    });
    // Cupom da Loja A não vale na B.
    await expect(storefront().quote(fx.storeB.slug, quoteBody(idsB, "DEZ"))).resolves.toMatchObject(
      {
        body: { ok: false, error: { code: "coupon_invalid", reason: "not_found" } },
      },
    );
  });

  it("limite de usos sob concorrência: só um Pedido leva o último uso", async () => {
    const { couponId } = data(
      await coupons.couponCreate(ownerA, {
        code: "UMSO",
        kind: "fixed",
        amountCents: 500,
        usageLimit: 1,
      }),
    );
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        storefront().create(fx.storeA.slug, createBody(idsA, { couponCode: "UMSO" })),
      ),
    );
    const created = replies.filter((reply) => reply.status === 201);
    expect(created).toHaveLength(1);
    for (const reply of replies.filter((r) => r.status !== 201)) {
      expect(reply).toEqual({
        status: 422,
        body: { ok: false, error: { code: "coupon_invalid", reason: "exhausted" } },
      });
    }
    expect(checkoutCreateResponseSchema.parse(created[0]!.body).ok).toBe(true);
    const list = data(await orders.ordersList(ownerA));
    expect(list.orders).toHaveLength(1);
    expect(list.orders[0]).toMatchObject({ totalCents: 5180 });
    const view = data(await coupons.couponsGet(ownerA)).coupons.find((c) => c.id === couponId)!;
    expect(view).toMatchObject({ usedCount: 1, status: "exhausted" });
    await expect(coupons.couponDelete(ownerA, { couponId })).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    await expect(
      coupons.couponUpdate(ownerA, {
        couponId,
        code: "UMSO",
        kind: "fixed",
        amountCents: 500,
        usageLimit: 1,
      }),
    ).resolves.toEqual({ ok: true, data: null });
  });
});

describe("Cupom de boas-vindas (primeira compra por Loja)", () => {
  it("só com conta e sem Pedido na Loja; Guest vinculado bloqueia; outra Loja vale", async () => {
    data(
      await coupons.welcomeCouponSet(ownerA, { active: true, kind: "fixed", amountCents: 1000 }),
    );
    data(await coupons.welcomeCouponSet(ownerB, { active: true, kind: "fixed", amountCents: 700 }));

    // Sem conta (Guest): nada de boas-vindas.
    await expect(storefront().quote(fx.storeA.slug, quoteBody(idsA))).resolves.toMatchObject({
      body: { ok: true, discountCents: 0, coupon: null },
    });

    const phone = randomPhone();
    const cookie = await signIn(phone, CPF_A);
    await expect(
      storefront().quote(fx.storeA.slug, quoteBody(idsA), cookie),
    ).resolves.toMatchObject({
      body: { ok: true, discountCents: 1000, coupon: { source: "welcome", code: null } },
    });
    const created = await storefront().create(fx.storeA.slug, createBody(idsA), cookie);
    expect(created.status).toBe(201);
    expect(data(await orders.ordersList(ownerA)).orders[0]).toMatchObject({ totalCents: 4680 });
    // Segunda compra na A: sem boas-vindas. Na B (sem Pedido): vale.
    await expect(
      storefront().quote(fx.storeA.slug, quoteBody(idsA), cookie),
    ).resolves.toMatchObject({
      body: { ok: true, discountCents: 0 },
    });
    await expect(
      storefront().quote(fx.storeB.slug, quoteBody(idsB), cookie),
    ).resolves.toMatchObject({
      body: { ok: true, discountCents: 700 },
    });
    expect(data(await coupons.couponsGet(ownerA)).welcome).toMatchObject({
      active: true,
      redeemedCount: 1,
    });

    // Pedido Guest com o telefone antes da conta bloqueia o boas-vindas naquela Loja.
    const guestPhone = randomPhone();
    await storefront().create(
      fx.storeB.slug,
      createBody(idsB, { customer: { name: "Caio", phone: guestPhone } }),
    );
    const guestCookie = await signIn(guestPhone, CPF_B);
    await expect(
      storefront().quote(fx.storeB.slug, quoteBody(idsB), guestCookie),
    ).resolves.toMatchObject({ body: { ok: true, discountCents: 0 } });
    await expect(
      storefront().quote(fx.storeA.slug, quoteBody(idsA), guestCookie),
    ).resolves.toMatchObject({ body: { ok: true, discountCents: 1000 } });

    // Operador não configura o boas-vindas.
    const operator = await loginAs(fx.operatorA);
    await expect(
      coupons.welcomeCouponSet(operator, { active: false, kind: "fixed", amountCents: 1 }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
  });
});
