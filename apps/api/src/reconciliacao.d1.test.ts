// Ticket 15 no workerd com D1: o handler `scheduled` REAL do Worker (export default de index.ts,
// com o wrapper do Sentry) invocado com `createScheduledController`, AbacatePay (PIX e Cartão
// Rápido) e Efí (Cartão Normal) fakes no limite HTTP — sem agendador nem rede externa. Prova:
// evento perdido converge cobrança e Ledger; pagamento tardio de Pedido Cancelado vira Estorno
// total; Estorno falho é retentado no provedor da cobrança; execução repetida ou concorrente = um
// efeito; Cartão recusado e abandonado vira Cancelado e libera o Cupom; liberação confirmada move só
// a previsão de repasse; repasse divergente vira alerta sem corrigir dinheiro; falha parcial não
// esconde as demais unidades e nada de dado pessoal ou segredo vai para os logs.
import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import { type CheckoutCreateRequestInput, checkoutCreateResponseSchema } from "@foode/shared/order";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import { abacatePayCardFromEnv, createCardService, efiCardFromEnv } from "./card-service";
import { createCouponService, type CouponService } from "./coupon-service";
import type { EmailSender } from "./email/sender";
import worker from "./index";
import { createMenuService } from "./menu-service";
import { sha256Hex } from "./order-crypto";
import { createOrderService, type OrderService } from "./order-service";
import { abacatePayFromEnv, createPixService } from "./pix-service";
import { CRON_PAYMENTS, CRON_SETTLEMENT, type ReconciliationSummary } from "./reconciliation";
import { createRefundService, refundGatewaysFromEnv } from "./refund-service";
import { createStorefrontService } from "./storefront-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const SECRETS = {
  orderTokenSecret: "segredo-de-teste-do-token-do-pedido",
  phoneLookupIpSalt: "sal-de-teste-do-ip-da-busca",
};
// As mesmas chaves fictícias do vitest.workers.config.ts que o handler lê do `env`.
const KEYS = env;
const EFI_BASE = "https://cobrancas-h.api.efipay.com.br";
const ABACATE_BASE = "https://api.abacatepay.com/v2";
// Quinta-feira, 12:00 em São Paulo.
const OPEN_NOW = new Date("2026-11-05T15:00:00.000Z");
/** 2 × R$ 25,90 + tarifa de serviço R$ 1,50. */
const ORDER_TOTAL = 5180;
const CHARGED = ORDER_TOTAL + 150;
const MIN = 60_000;
/** Dados pessoais e segredos que nunca podem aparecer em log. */
const FORBIDDEN_IN_LOGS = [
  "Maria Souza",
  "91234",
  "5511912345678",
  "52998224725",
  "529.982.247-25",
  "ana@exemplo.com",
  "1990-05-17",
  "abc_teste",
  "segredo-webhook-teste",
  "efi-client-secret-teste",
  "segredo-notificacao-efi-teste",
];

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let orders: OrderService;
let coupons: CouponService;
let owner: PainelCaller;
let ownerB: PainelCaller;
let itemId: string;
let itemIdB: string;
let now: Date;
// O D1 do arquivo é compartilhado entre os testes (as varreduras do Cron veem as cobranças dos
// testes anteriores): os provedores fakes também guardam todas as cobranças do arquivo.
const efiCharges = new Map<number, { amount: number; customId: string }>();
const efiStatus = new Map<number, string>();
const abacateCharges = new Map<string, { amount: number; intentId: string }>();
/** Status do PIX/Cartão na AbacatePay por cobrança (consulta autenticada). */
const abacateStatus = new Map<string, string>();
let abacateRefunds: string[];
let efiRefunds: number[];
let abacateRefundFails: boolean;
let pixCheckDown: boolean;
let efiOneStep: "approved" | "waiting" | "network";
let abacateCardCreate: "APPROVED" | "PENDING";
let logs: string[];
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
      "x-captcha-response": "captcha-ok",
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

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** Efí e AbacatePay fakes no limite HTTP (o handler usa o `fetch` global). */
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  if (url === TURNSTILE_SITEVERIFY_URL) return json({ success: true });
  if (url === `${EFI_BASE}/v1/authorize`) {
    return json({ access_token: "token-efi-teste", expires_in: 600 });
  }
  if (url === `${EFI_BASE}/v1/charge/one-step`) {
    if (efiOneStep === "network") throw new TypeError("fetch failed");
    const body = JSON.parse(String(init?.body)) as {
      items: { value: number }[];
      metadata: { custom_id: string };
    };
    const chargeId = 700_000 + Math.floor(Math.random() * 99_999);
    const amount = body.items[0]!.value;
    efiCharges.set(chargeId, { amount, customId: body.metadata.custom_id });
    efiStatus.set(chargeId, efiOneStep === "waiting" ? "waiting" : "approved");
    return json({
      code: 200,
      data: {
        charge_id: chargeId,
        status: efiStatus.get(chargeId),
        total: amount,
        custom_id: body.metadata.custom_id,
      },
    });
  }
  const efiRefund = url.match(/\/v1\/charge\/card\/(\d+)\/refund$/u);
  if (efiRefund) {
    efiRefunds.push(Number(efiRefund[1]));
    return json({ code: 200, data: "Reembolso em processamento" });
  }
  const efiCharge = url.match(/\/v1\/charge\/(\d+)$/u);
  if (efiCharge) {
    const chargeId = Number(efiCharge[1]);
    const charge = efiCharges.get(chargeId)!;
    return json({
      code: 200,
      data: {
        charge_id: chargeId,
        total: charge.amount,
        status: efiStatus.get(chargeId),
        custom_id: charge.customId,
      },
    });
  }
  if (url === `${ABACATE_BASE}/transparents/create`) {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      data: { amount: number; expiresIn?: number; metadata: { intentId: string } };
    };
    const pix = body.method === "PIX";
    const id = `${pix ? "pix_char" : "card"}_${crypto.randomUUID().replaceAll("-", "")}`;
    abacateCharges.set(id, { amount: body.data.amount, intentId: body.data.metadata.intentId });
    abacateStatus.set(id, pix ? "PENDING" : abacateCardCreate);
    return json({
      success: true,
      error: null,
      data: pix
        ? {
            id,
            amount: body.data.amount,
            status: "PENDING",
            devMode: true,
            brCode: `000201-${id}`,
            brCodeBase64: "data:image/png;base64,iVBORw0KGgo=",
            platformFee: 54,
            expiresAt: new Date(now.getTime() + (body.data.expiresIn ?? 1800) * 1000).toISOString(),
            metadata: body.data.metadata,
          }
        : {
            id,
            amount: body.data.amount,
            status: abacateCardCreate,
            devMode: true,
            brand: "mastercard",
            lastFour: "5454",
            platformFee: 385,
            metadata: body.data.metadata,
          },
    });
  }
  if (url.startsWith(`${ABACATE_BASE}/transparents/check`)) {
    if (pixCheckDown) throw new TypeError("fetch failed");
    const id = new URL(url).searchParams.get("id")!;
    return json({ success: true, error: null, data: { status: abacateStatus.get(id) } });
  }
  if (url.startsWith(`${ABACATE_BASE}/transparents/get`)) {
    const id = new URL(url).searchParams.get("id")!;
    const charge = abacateCharges.get(id)!;
    return json({
      success: true,
      error: null,
      data: {
        id,
        amount: charge.amount,
        status: abacateStatus.get(id),
        devMode: true,
        brand: "mastercard",
        lastFour: "5454",
        platformFee: 385,
        metadata: { intentId: charge.intentId },
      },
    });
  }
  if (url === `${ABACATE_BASE}/transparents/refund`) {
    const body = JSON.parse(String(init?.body)) as { id: string };
    abacateRefunds.push(body.id);
    if (abacateRefundFails) return json({ success: false, error: "Erro interno" }, 500);
    return json({ success: true, error: null, data: { id: body.id, status: "PENDING" } });
  }
  return realFetch(input, init);
}

const viaGlobalFetch = (url: string, init: RequestInit) => globalThis.fetch(url, init);
const quiet = () => undefined;

function refundService() {
  return createRefundService({
    db,
    gateways: refundGatewaysFromEnv(KEYS, viaGlobalFetch),
    now: () => now,
    report: quiet,
  });
}

function cardService() {
  return createCardService({
    db,
    efi: efiCardFromEnv(KEYS, viaGlobalFetch),
    abacatePay: abacatePayCardFromEnv(KEYS, viaGlobalFetch),
    refunds: refundService(),
    now: () => now,
  });
}

function pixService() {
  return createPixService({
    db,
    provider: abacatePayFromEnv(KEYS, viaGlobalFetch),
    card: cardService(),
    refunds: refundService(),
    now: () => now,
  });
}

function storefront() {
  return createStorefrontService({
    db,
    turnstile: { verify: async () => true },
    ...SECRETS,
    pix: pixService(),
    card: cardService(),
    now: () => now,
  });
}

function body(
  item: string,
  payment: CheckoutCreateRequestInput["payment"],
  overrides: Partial<CheckoutCreateRequestInput> = {},
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    lines: [{ itemId: item, quantity: 2, complementSelections: {}, additionalIds: [] }],
    fulfillment: "pickup",
    customer: { name: "Maria Souza", phone: "(11) 91234-5678" },
    payment,
    note: null,
    ...overrides,
  } satisfies CheckoutCreateRequestInput;
}

const efiCard = () => ({
  sdk: "efi" as const,
  paymentToken: `tok${crypto.randomUUID().replaceAll("-", "")}`,
  payer: { cpf: "529.982.247-25", email: "ana@exemplo.com", birthDate: "1990-05-17" },
  brand: "visa" as const,
  lastFour: "4242",
});

const abacateCard = () => ({
  sdk: "abacatepay" as const,
  token: `ctok_${crypto.randomUUID().replaceAll("-", "")}`,
  payer: { cpf: "52998224725", email: "ana@exemplo.com" },
  brand: "mastercard" as const,
  lastFour: "5454",
});

async function createOrder(slug: string, request: ReturnType<typeof body>) {
  const reply = await storefront().create(slug, request);
  const parsed = checkoutCreateResponseSchema.parse(reply.body);
  if (!parsed.ok) throw new Error(`esperava ok: ${JSON.stringify(parsed.error)}`);
  const found = await db.storefront.orderByTokenHash(slug, await sha256Hex(parsed.accessToken));
  return found!.order.id;
}

/** Dispara o handler `scheduled` real do Worker (como o Cron Trigger faria). */
async function fire(cron: string, at: Date): Promise<void> {
  const controller = createScheduledController({ cron, scheduledTime: at });
  const ctx = createExecutionContext();
  await worker.scheduled!(controller, env, ctx);
  await waitOnExecutionContext(ctx);
}

/** Roda o handler e devolve o resumo que ele registrou nos Workers Logs. */
async function runCron(cron: string, at: Date): Promise<ReconciliationSummary> {
  const before = logs.length;
  await fire(cron, at);
  const [summary] = summariesSince(before);
  expect(summary).toBeDefined();
  return summary!;
}

function summariesSince(index: number): ReconciliationSummary[] {
  return logs
    .slice(index)
    .filter((line) => line.includes('"message":"reconciliation_run"'))
    .map((line) => JSON.parse(line) as ReconciliationSummary);
}

beforeEach(async () => {
  now = OPEN_NOW;
  abacateRefunds = [];
  efiRefunds = [];
  abacateRefundFails = false;
  pixCheckDown = false;
  efiOneStep = "approved";
  abacateCardCreate = "APPROVED";
  logs = [];
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  orders = createOrderService({
    db,
    auth,
    orderTokenSecret: SECRETS.orderTokenSecret,
    refunds: refundService(),
    now: () => now,
  });
  coupons = createCouponService({ db, auth, now: () => OPEN_NOW });
  vi.spyOn(globalThis, "fetch").mockImplementation(fakeFetch);
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
  const ops = db.ops((await db.access.opsContext(fx.ops.id))!);
  await ops.updateStore(fx.storeA.id, storeProfileFixture());
  await ops.updateStore(fx.storeB.id, storeProfileFixture());
  // Loja A no Normal (Efí) com PIX; Loja B no Rápido (AbacatePay).
  await ops.setCardMode(fx.storeA.id, "normal");
  await ops.setCardMode(fx.storeB.id, "rapido");
  owner = await loginAs(fx.ownerA);
  ownerB = await loginAs(fx.ownerB);
  itemId = await configureStore(owner);
  itemIdB = await configureStore(ownerB);
  const validFrom = "2020-01-01T00:00:00.000Z";
  await ops.createPaymentFees(fx.storeA.id, [
    { method: "pix", cardMode: null, percentBps: 99, fixedCents: 0, validFrom, validTo: null },
    {
      method: "credit",
      cardMode: "normal",
      percentBps: 349,
      fixedCents: 99,
      validFrom,
      validTo: null,
    },
  ]);
  await ops.createPaymentFees(fx.storeB.id, [
    {
      method: "credit",
      cardMode: "rapido",
      percentBps: 542,
      fixedCents: 159,
      validFrom,
      validTo: null,
    },
  ]);
});

afterEach(() => {
  // Nenhuma linha de log (resumos, avisos, alertas) leva dado pessoal ou segredo.
  const all = logs.join("\n");
  for (const forbidden of FORBIDDEN_IN_LOGS) expect(all).not.toContain(forbidden);
  vi.restoreAllMocks();
});

describe("liberações e obrigação de repasse (Cron diário)", () => {
  it("liberação confirmada move só a previsão de repasse; nada vira repasse efetivo", async () => {
    const orderId = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "credit", card: efiCard() }),
    );
    const intent = (await db.cardPayments.latestOfOrder(orderId))!;
    expect(intent).toMatchObject({ state: "approved", releaseSource: "max_term" });
    const [before] = await db.payments.ledgerOfIntent(intent.intentId);

    // Ainda `approved` na Efí: conferido, nada muda.
    const day1 = await runCron(CRON_SETTLEMENT, new Date("2026-11-06T12:00:00.000Z"));
    expect(day1).toMatchObject({ job: "settlement", status: "ok" });
    expect(day1.units.cardReleases).toMatchObject({ checked: 1, confirmed: 0, failed: 0 });
    expect(await db.payments.ledgerOfIntent(intent.intentId)).toEqual([before]);

    // Terça 10/11: a Efí creditou (`paid`) → liberação hoje, repasse previsto no dia útil seguinte.
    efiStatus.set(Number(intent.providerChargeId), "paid");
    const day5 = await runCron(CRON_SETTLEMENT, new Date("2026-11-10T09:00:00.000Z"));
    expect(day5.units.cardReleases).toEqual({ checked: 1, confirmed: 1, failed: 0 });
    expect((await db.payments.ledgerOfIntent(intent.intentId))[0]).toMatchObject({
      releaseDate: "2026-11-10",
      expectedPayoutDate: "2026-11-11",
      netCents: before!.netCents,
      chargedCents: before!.chargedCents,
    });
    expect(await db.reconciliation.releaseConfirmationOfIntent(intent.intentId)).toEqual({
      providerStatus: "paid",
      releaseDate: "2026-11-10",
      expectedPayoutDate: "2026-11-11",
      previousReleaseDate: before!.releaseDate,
      previousExpectedPayoutDate: before!.expectedPayoutDate,
    });
    expect(await db.cardPayments.byIntentId(intent.intentId)).toMatchObject({
      expectedReleaseDate: "2026-11-10",
      releaseSource: "informed",
    });

    // Repetir: nada muda; e depois do repasse previsto não há divergência (liberação confirmada).
    const again = await runCron(CRON_SETTLEMENT, new Date("2026-11-12T09:00:00.000Z"));
    expect(again.units.cardReleases).toEqual({ checked: 0, confirmed: 0, failed: 0 });
    expect(again.units.payoutDivergences).toMatchObject({ total: 0 });

    // Previsão não é repasse efetivo: cancelar agora ANULA o lançamento (nada foi repassado).
    now = new Date("2026-11-12T15:00:00.000Z");
    data(await orders.ordersCancel(owner, { orderId }));
    expect(await db.refunds.reversalsOfOrder(orderId)).toEqual([
      expect.objectContaining({ kind: "annulment", expectedPayoutDate: "2026-11-11" }),
    ]);
  });

  it("repasse previsto vencido sem liberação no provedor vira alerta, sem corrigir dinheiro", async () => {
    const orderId = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "credit", card: efiCard() }),
    );
    const intent = (await db.cardPayments.latestOfOrder(orderId))!;
    const [before] = await db.payments.ledgerOfIntent(intent.intentId);

    const late = new Date(`${before!.expectedPayoutDate}T12:00:00.000Z`);
    const run = await runCron(CRON_SETTLEMENT, late);
    expect(run.units.cardReleases).toEqual({ checked: 1, confirmed: 0, failed: 0 });
    expect(run.units.payoutDivergences).toMatchObject({ payoutDueUnreleased: 1, total: 1 });
    expect(logs.some((line) => line.includes('"message":"payout_divergence"'))).toBe(true);
    expect(await db.payments.ledgerOfIntent(intent.intentId)).toEqual([before]);
    expect(await db.reconciliation.releaseConfirmationOfIntent(intent.intentId)).toBeNull();
  });
});

describe("evento perdido converge cobrança e Ledger", () => {
  it("PIX e Cartão (Efí e AbacatePay) pagos no provedor sem webhook; repetir não muda nada", async () => {
    const pixOrder = await createOrder(fx.storeA.slug, body(itemId, { method: "pix" }));
    efiOneStep = "waiting";
    const efiOrder = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "credit", card: efiCard() }),
    );
    abacateCardCreate = "PENDING";
    const abacateOrder = await createOrder(
      fx.storeB.slug,
      body(itemIdB, { method: "credit", card: abacateCard() }),
    );
    const pix = (await db.payments.pixIntentOfOrder(pixOrder))!;
    const efi = (await db.cardPayments.latestOfOrder(efiOrder))!;
    const abacate = (await db.cardPayments.latestOfOrder(abacateOrder))!;
    expect([pix.state, efi.state, abacate.state]).toEqual(["pending", "pending", "pending"]);

    // O dinheiro entrou nos três provedores; nenhum webhook chegou.
    abacateStatus.set(pix.providerChargeId!, "PAID");
    efiStatus.set(Number(efi.providerChargeId), "approved");
    abacateStatus.set(abacate.providerChargeId!, "APPROVED");

    const at = new Date(OPEN_NOW.getTime() + 3 * MIN);
    const first = await runCron(CRON_PAYMENTS, at);
    expect(first).toMatchObject({
      job: "payments",
      status: "ok",
      failedUnits: [],
      itemFailures: 0,
      units: {
        pixReconcile: { checked: 1, paid: 1, expired: 0, failed: 0 },
        cardStale: { gaveUp: 0, checked: 2, failed: 0 },
      },
    });
    for (const [intentId, orderId] of [
      [pix.intentId, pixOrder],
      [efi.intentId, efiOrder],
      [abacate.intentId, abacateOrder],
    ] as const) {
      const ledger = await db.payments.ledgerOfIntent(intentId);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        orderId,
        chargedCents: CHARGED,
        netCents: expect.any(Number),
      });
    }
    // O Painel só vê Pedido pago: os três entraram na fila.
    for (const [caller, orderId] of [
      [owner, pixOrder],
      [owner, efiOrder],
      [ownerB, abacateOrder],
    ] as const) {
      expect(data(await orders.ordersGet(caller, { orderId }))).toMatchObject({
        status: "received",
      });
    }

    // Repetida (mesmo horário ou depois): nenhum efeito novo, nenhum lançamento a mais.
    const again = await runCron(CRON_PAYMENTS, new Date(at.getTime() + 10 * MIN));
    expect(again.units.pixReconcile).toEqual({ checked: 0, paid: 0, expired: 0, failed: 0 });
    expect(again.units.cardStale).toEqual({ gaveUp: 0, checked: 0, failed: 0 });
    for (const intentId of [pix.intentId, efi.intentId, abacate.intentId]) {
      expect(await db.payments.ledgerOfIntent(intentId)).toHaveLength(1);
    }
    expect(abacateRefunds).toEqual([]);
    expect(efiRefunds).toEqual([]);
  });
});

describe("pagamento tardio de Pedido Cancelado", () => {
  it("PIX vencido é cancelado; pago depois no provedor = Estorno total uma vez só", async () => {
    data(
      await coupons.couponCreate(owner, {
        code: "DEZ",
        kind: "fixed",
        amountCents: 200,
        usageLimit: 1,
      } as never),
    );
    const orderId = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "pix" }, { couponCode: "DEZ" }),
    );
    const intent = (await db.payments.pixIntentOfOrder(orderId))!;
    const chargeId = intent.providerChargeId!;
    abacateStatus.set(chargeId, "EXPIRED");

    const expiredAt = new Date(Date.parse(intent.expiresAt!) + 1_000);
    const expiry = await runCron(CRON_PAYMENTS, expiredAt);
    expect(expiry.units.pixExpire).toMatchObject({ cancelled: 1, failed: 0 });
    expect(await db.refunds.cancellationOf(orderId)).toMatchObject({
      reason: "pix_expired",
      actorUserId: null,
    });
    expect(data(await coupons.couponsGet(owner)).coupons[0]?.usedCount).toBe(0);

    // O Consumidor pagou no limite e o webhook se perdeu: a janela de 48 h confere de novo.
    abacateStatus.set(chargeId, "PAID");
    const late = await runCron(CRON_PAYMENTS, new Date(expiredAt.getTime() + 31 * MIN));
    expect(late.units.pixReconcile).toMatchObject({ paid: 1, failed: 0 });
    const [refund] = await db.refunds.ofOrder(orderId);
    expect(refund).toMatchObject({
      origin: "late_payment",
      provider: "abacatepay",
      providerChargeId: chargeId,
      amountCents: ORDER_TOTAL - 200 + 150,
      state: "requested",
    });
    expect(abacateRefunds).toEqual([chargeId]);
    expect(await db.refunds.reversalsOfOrder(orderId)).toEqual([
      expect.objectContaining({ kind: "annulment" }),
    ]);
    expect(await db.refunds.cancellationOf(orderId)).toMatchObject({ reason: "pix_expired" });

    // Repetir mais tarde não estorna de novo (e o Estorno aceito é conferido no provedor; o
    // `requested_at` vem do relógio do banco, por isso o horário parte do maior dos dois).
    abacateStatus.set(chargeId, "REFUNDED");
    const after = await runCron(
      CRON_PAYMENTS,
      new Date(Math.max(Date.now(), expiredAt.getTime() + 62 * MIN) + 16 * MIN),
    );
    expect(after.units.pixReconcile).toMatchObject({ paid: 0 });
    expect(after.units.refunds).toMatchObject({ attempted: 0, confirmed: 1 });
    expect(abacateRefunds).toEqual([chargeId]);
    expect((await db.refunds.ofOrder(orderId))[0]?.state).toBe("succeeded");
  });
});

describe("Estorno pendente/falho, repetição e concorrência", () => {
  it("falha no provedor fica retentável; dois Crons sobrepostos = um Estorno", async () => {
    const orderId = await createOrder(fx.storeA.slug, body(itemId, { method: "pix" }));
    const intent = (await db.payments.pixIntentOfOrder(orderId))!;
    abacateStatus.set(intent.providerChargeId!, "PAID");
    await runCron(CRON_PAYMENTS, new Date(OPEN_NOW.getTime() + 3 * MIN));

    abacateRefundFails = true;
    now = new Date(OPEN_NOW.getTime() + 5 * MIN);
    const cancelled = data(await orders.ordersCancel(owner, { orderId }));
    expect(cancelled.consequence).toMatchObject({ kind: "refund" });
    expect((await db.refunds.ofOrder(orderId))[0]).toMatchObject({
      state: "failed",
      provider: "abacatepay",
    });
    expect(abacateRefunds).toHaveLength(1);

    // Ainda no backoff: o Cron não chama o provedor.
    const early = await runCron(CRON_PAYMENTS, now);
    expect(early.units.refunds).toMatchObject({ attempted: 0 });

    abacateRefundFails = false;
    const at = new Date(now.getTime() + 60 * MIN);
    const before = logs.length;
    await Promise.all([fire(CRON_PAYMENTS, at), fire(CRON_PAYMENTS, at)]);
    const [a, b] = summariesSince(before);
    const statuses = [a!.status, b!.status].sort();
    expect(statuses).toEqual(["ok", "skipped"]);
    const ran = a!.status === "ok" ? a! : b!;
    expect(ran.units.refunds).toMatchObject({ attempted: 1, requested: 1, failed: 0 });
    expect(abacateRefunds).toEqual([intent.providerChargeId, intent.providerChargeId]);
    expect((await db.refunds.ofOrder(orderId))[0]?.state).toBe("requested");

    // A trava foi solta com o resumo; outra execução depois roda normalmente, sem novo Estorno.
    const lock = await db.reconciliation.lockOf("payments");
    expect(lock).toMatchObject({ holder: null, lockedUntil: null });
    expect(JSON.parse(lock!.lastSummary!)).toMatchObject({ status: "ok" });
    const next = await runCron(CRON_PAYMENTS, new Date(at.getTime() + 5 * MIN));
    expect(next.status).toBe("ok");
    expect(abacateRefunds).toHaveLength(2);
  });
});

describe("Cartão recusado e abandonado", () => {
  it("2 h sem nova tentativa nem PIX: Cancelado (sistema), Cupom liberado, idempotente", async () => {
    data(
      await coupons.couponCreate(owner, {
        code: "CINCO",
        kind: "fixed",
        amountCents: 500,
        usageLimit: 1,
      } as never),
    );
    efiOneStep = "network";
    const orderId = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "credit", card: efiCard() }, { couponCode: "CINCO" }),
    );
    expect(data(await coupons.couponsGet(owner)).coupons[0]?.usedCount).toBe(1);

    // Sem desfecho por 5 min: recusada (libera outra tentativa). O prazo conta da recusa.
    const declinedAt = OPEN_NOW.getTime() + 6 * MIN;
    const gaveUp = await runCron(CRON_PAYMENTS, new Date(declinedAt));
    expect(gaveUp.units.cardStale).toMatchObject({ gaveUp: 1 });
    expect(gaveUp.units.cardAbandoned).toEqual({ cancelled: 0, failed: 0 });
    expect(await db.cardPayments.latestOfOrder(orderId)).toMatchObject({ state: "declined" });

    const soon = await runCron(CRON_PAYMENTS, new Date(declinedAt + 60 * MIN));
    expect(soon.units.cardAbandoned).toEqual({ cancelled: 0, failed: 0 });
    expect(await db.refunds.cancellationOf(orderId)).toBeNull();

    const later = new Date(declinedAt + 2 * 60 * MIN + 5 * MIN);
    const abandoned = await runCron(CRON_PAYMENTS, later);
    expect(abandoned.units.cardAbandoned).toEqual({ cancelled: 1, failed: 0 });
    expect(await db.refunds.cancellationOf(orderId)).toMatchObject({
      reason: "card_abandoned",
      actorUserId: null,
      actorRole: null,
    });
    expect(data(await coupons.couponsGet(owner)).coupons[0]?.usedCount).toBe(0);
    expect(await db.refunds.ofOrder(orderId)).toEqual([]);

    const repeat = await runCron(CRON_PAYMENTS, new Date(later.getTime() + 5 * MIN));
    expect(repeat.units.cardAbandoned).toEqual({ cancelled: 0, failed: 0 });
  });
});

describe("falha parcial", () => {
  it("provedor fora numa unidade não esconde as demais; resumo e alerta sem dado pessoal", async () => {
    const paid = await createOrder(fx.storeA.slug, body(itemId, { method: "pix" }));
    const paidIntent = (await db.payments.pixIntentOfOrder(paid))!;
    abacateStatus.set(paidIntent.providerChargeId!, "PAID");
    await runCron(CRON_PAYMENTS, new Date(OPEN_NOW.getTime() + 3 * MIN));
    abacateRefundFails = true;
    now = new Date(OPEN_NOW.getTime() + 4 * MIN);
    data(await orders.ordersCancel(owner, { orderId: paid }));
    abacateRefundFails = false;
    now = new Date(OPEN_NOW.getTime() + 65 * MIN);
    const open = await createOrder(fx.storeA.slug, body(itemId, { method: "pix" }));

    // AbacatePay fora só na consulta do PIX: a unidade falha por item; o Estorno sai mesmo assim.
    pixCheckDown = true;
    const run = await runCron(CRON_PAYMENTS, new Date(OPEN_NOW.getTime() + 70 * MIN));
    expect(run.status).toBe("partial");
    expect(run.failedUnits).toEqual([]);
    expect(run.itemFailures).toBeGreaterThanOrEqual(1);
    expect(run.units.pixReconcile).toEqual({ checked: 0, paid: 0, expired: 0, failed: 1 });
    expect(run.units.refunds).toMatchObject({ attempted: 1, requested: 1, failed: 0 });
    expect(abacateRefunds).toEqual([paidIntent.providerChargeId, paidIntent.providerChargeId]);
    expect(logs.some((line) => line.includes('"message":"reconciliation_partial_failure"'))).toBe(
      true,
    );
    // O PIX aberto segue aberto (provedor fora dentro da carência): nada foi cancelado às cegas.
    expect((await db.payments.pixIntentOfOrder(open))?.state).toBe("pending");
  });
});
