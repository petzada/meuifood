// Ticket 31 no workerd com D1 (só no CI): lead da landing (Turnstile, rate limit por IP, aviso
// por e-mail), RPCs de leads do Ops (só `foode_ops`), tabela padrão pública de taxas e R$/km do
// Delivery (decisão 73). Better Auth real; siteverify e MillionSend interceptados no `fetch`.
import { env } from "cloudflare:test";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import { seedTwoStores, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import { publicDefaultFeesResponseSchema } from "@foode/shared/ops";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import { MILLIONSEND_EMAILS_URL } from "./email/sender";
import type { Env } from "./env";
import { createOpsService, type OpsService } from "./ops-service";
import { createOrderService, type OrderService } from "./order-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
const PAST = "2026-01-01T00:00:00.000Z";
const NOTIFY = "avisos@foode.test";

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let ops: OpsService;
let orders: OrderService;
let sentEmails: { to: string[]; subject: string; text: string }[];
const realFetch = globalThis.fetch;

const testEnv = (): Env =>
  ({
    ...env,
    PHONE_LOOKUP_IP_SALT: "sal-de-teste-do-ip-dos-leads",
    LEADS_NOTIFY_EMAIL: NOTIFY,
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

// Cada login redefine a senha (token de definir senha) e o reset revoga as sessões abertas do
// usuário: o login é feito uma vez por usuário e reaproveitado.
const callers = new Map<string, Promise<PainelCaller>>();
function loginAs(user: { id: string; email: string }): Promise<PainelCaller> {
  const cached = callers.get(user.id);
  if (cached) return cached;
  const created = freshLogin(user);
  callers.set(user.id, created);
  return created;
}

async function freshLogin(user: { id: string; email: string }): Promise<PainelCaller> {
  const token = await auth.createSetPasswordToken(user.id, INVITE_TOKEN_TTL_SECONDS);
  const reset = await auth.handler(
    authRequest("/reset-password", { token, newPassword: PASSWORD }),
  );
  expect(reset.status).toBe(200);
  const response = await auth.handler(
    authRequest("/sign-in/email", { email: user.email, password: PASSWORD }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { cookie, ip: randomIp() };
}

function leadBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ana Souza",
    whatsapp: "(11) 99999-1234",
    storeName: `Burger ${crypto.randomUUID().slice(0, 6)}`,
    city: "São Paulo",
    ordersPerDay: "10_a_50",
    source: "cta-final",
    turnstileToken: CAPTCHA_OK,
    ...overrides,
  };
}

function postLead(body: unknown, ip: string) {
  return createApp().fetch(
    new Request("https://api.foode.test/storefront/leads", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify(body),
    }),
    testEnv(),
  );
}

async function opsLeads() {
  const caller = await loginAs(fx.ops);
  const result = await ops.opsListLeads(caller, {});
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  auth = createAuth(env, { email: { send: async () => ({ id: "email" }) }, waitUntil: () => {} });
  ops = createOpsService({ db, auth });
  orders = createOrderService({ db, auth, orderTokenSecret: undefined });
  sentEmails = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === TURNSTILE_SITEVERIFY_URL) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { response?: string };
      return Response.json({ success: body.response === CAPTCHA_OK });
    }
    if (url === MILLIONSEND_EMAILS_URL) {
      sentEmails.push(JSON.parse(String(init?.body ?? "{}")));
      return Response.json({ id: "email-lead" });
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /storefront/leads", () => {
  it("grava o lead normalizado e avisa a Foode por e-mail", async () => {
    const body = leadBody();
    const response = await postLead(body, randomIp());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });

    const lead = (await opsLeads()).find((row) => row.storeName === body.storeName);
    expect(lead).toMatchObject({
      name: "Ana Souza",
      whatsapp: "5511999991234",
      city: "São Paulo",
      ordersPerDay: "10_a_50",
      source: "cta-final",
      status: "new",
    });
    await vi.waitFor(() => expect(sentEmails).toHaveLength(1));
    expect(sentEmails[0]!.to).toEqual([NOTIFY]);
    expect(sentEmails[0]!.text).toContain("5511999991234");
  });

  it("Turnstile reprovado = 403 sem gravar; corpo inválido = 400", async () => {
    const body = leadBody({ turnstileToken: "token-ruim" });
    const denied = await postLead(body, randomIp());
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "captcha_failed" });

    const invalid = await postLead(leadBody({ whatsapp: "1234" }), randomIp());
    expect(invalid.status).toBe(400);

    expect((await opsLeads()).some((row) => row.storeName === body.storeName)).toBe(false);
    expect(sentEmails).toHaveLength(0);
  });

  it("rate limit por IP: a 4ª tentativa na janela = 429; outro IP segue", async () => {
    const ip = randomIp();
    for (let i = 0; i < 3; i += 1) {
      expect((await postLead(leadBody(), ip)).status).toBe(201);
    }
    const limited = await postLead(leadBody(), ip);
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ error: "rate_limited" });
    expect((await postLead(leadBody(), randomIp())).status).toBe(201);
  });
});

describe("leads no Ops", () => {
  it("só foode_ops lista e muda status; Dono/Operador = forbidden; sem sessão = unauthenticated", async () => {
    expect((await postLead(leadBody(), randomIp())).status).toBe(201);
    const [lead] = await opsLeads();
    expect(lead).toBeDefined();

    const anon: PainelCaller = { cookie: "", ip: randomIp() };
    await expect(ops.opsListLeads(anon, {})).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
    for (const user of [fx.ownerA, fx.operatorA, fx.ownerB]) {
      const caller = await loginAs(user);
      await expect(ops.opsListLeads(caller, {})).resolves.toEqual({
        ok: false,
        error: "forbidden",
      });
      await expect(
        ops.opsSetLeadStatus(caller, { leadId: lead!.id, status: "discarded" }),
      ).resolves.toEqual({ ok: false, error: "forbidden" });
    }
    expect((await opsLeads()).find((row) => row.id === lead!.id)?.status).toBe("new");

    const opsCaller = await loginAs(fx.ops);
    await expect(
      ops.opsSetLeadStatus(opsCaller, { leadId: lead!.id, status: "contacted" }),
    ).resolves.toEqual({ ok: true, data: null });
    // Mesmo status de novo: idempotente.
    await expect(
      ops.opsSetLeadStatus(opsCaller, { leadId: lead!.id, status: "contacted" }),
    ).resolves.toEqual({ ok: true, data: null });
    const updated = (await opsLeads()).find((row) => row.id === lead!.id);
    expect(updated).toMatchObject({ status: "contacted", statusChangedByEmail: fx.ops.email });

    const filtered = await ops.opsListLeads(opsCaller, { status: "new" });
    expect(filtered.ok && filtered.data.some((row) => row.id === lead!.id)).toBe(false);

    await expect(
      ops.opsSetLeadStatus(opsCaller, { leadId: crypto.randomUUID(), status: "contacted" }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(
      ops.opsSetLeadStatus(opsCaller, { leadId: lead!.id, status: "outro" as "new" }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("GET /storefront/taxas", () => {
  const getFees = async () => {
    const response = await createApp().fetch(
      new Request("https://api.foode.test/storefront/taxas"),
      testEnv(),
    );
    expect(response.status).toBe(200);
    return publicDefaultFeesResponseSchema.parse(await response.json());
  };

  it("só a tabela padrão vigente (sem override de Loja nem taxa encerrada)", async () => {
    const opsCaller = await loginAs(fx.ops);
    const created = await ops.opsCreatePaymentFees(opsCaller, {
      storeId: null,
      fees: [
        { method: "pix", percentBps: 99, validFrom: PAST },
        { method: "credit", cardMode: "normal", percentBps: 399, fixedCents: 30, validFrom: PAST },
        {
          method: "credit",
          cardMode: "rapido",
          percentBps: 699,
          validFrom: PAST,
          validTo: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    expect(created.ok).toBe(true);
    const override = await ops.opsCreatePaymentFees(opsCaller, {
      storeId: fx.storeA.id,
      fees: [{ method: "pix", percentBps: 1, validFrom: PAST }],
    });
    expect(override.ok).toBe(true);

    const { fees } = await getFees();
    expect(fees).toEqual([
      { method: "pix", cardMode: null, percentBps: 99, fixedCents: 0 },
      { method: "credit", cardMode: "normal", percentBps: 399, fixedCents: 30 },
    ]);
  });
});

describe("R$/km do Delivery (decisão 73)", () => {
  it("o Dono grava e limpa; o Operador não; valor inválido = invalid_input", async () => {
    const owner = await loginAs(fx.ownerA);
    const before = await orders.storeOperationGet(owner);
    expect(before.ok && before.data.deliveryRatePerKmCents).toBe(null);

    await expect(orders.storeSetDeliveryRate(owner, { ratePerKmCents: 150 })).resolves.toEqual({
      ok: true,
      data: null,
    });
    const after = await orders.storeOperationGet(owner);
    expect(after.ok && after.data.deliveryRatePerKmCents).toBe(150);

    const operator = await loginAs(fx.operatorA);
    await expect(
      orders.storeSetDeliveryRate(operator, { ratePerKmCents: 999 }),
    ).resolves.toMatchObject({ ok: false, error: "forbidden" });
    await expect(orders.storeSetDeliveryRate(owner, { ratePerKmCents: 0 })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });

    // Loja B não enxerga o valor da Loja A.
    const ownerB = await loginAs(fx.ownerB);
    const storeB = await orders.storeOperationGet(ownerB);
    expect(storeB.ok && storeB.data.deliveryRatePerKmCents).toBe(null);

    await orders.storeSetDeliveryRate(owner, { ratePerKmCents: null });
    const cleared = await orders.storeOperationGet(owner);
    expect(cleared.ok && cleared.data.deliveryRatePerKmCents).toBe(null);
  });
});
