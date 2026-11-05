// Ticket 12 no workerd com D1 (só no CI): Cancelamento com Estorno automático ponta a ponta, com
// AbacatePay (PIX e Cartão Rápido) e Efí (Cartão Normal) fakes no limite HTTP. Prova: Dono e
// Operador usam o mesmo contrato; Pagamento na entrega só muda o Pedido; PIX/Cartão pagos geram a
// obrigação de Estorno total (inclusive a tarifa de serviço) no provedor da cobrança gravada,
// antes da chamada; cancelar duas vezes não estorna duas vezes; falha do provedor não reabre o
// Pedido e é retentada; webhooks de Estorno repetidos não têm efeito duplo; Ledger anulado sem
// apagar o lançamento; PIX vencido vira Cancelado, libera o Cupom e o pagamento tardio converge
// para Estorno total; isolamento entre Lojas. Dados únicos por teste (fixture de duas Lojas).
import { env } from "cloudflare:test";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import {
  markLedgerPaidOut,
  seedTwoStores,
  storeProfileFixture,
  type TwoStoresFixture,
} from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import {
  type CheckoutCreateRequestInput,
  cancelOrderResultSchema,
  checkoutCreateResponseSchema,
} from "@foode/shared/order";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import { abacatePayCardFromEnv, createCardService, efiCardFromEnv } from "./card-service";
import { createCouponService, type CouponService } from "./coupon-service";
import type { EmailSender } from "./email/sender";
import { createMenuService } from "./menu-service";
import { sha256Hex } from "./order-crypto";
import { createOrderService, type OrderService } from "./order-service";
import { abacatePayFromEnv, createPixService } from "./pix-service";
import { signAbacatePayBody } from "./providers/abacatepay/webhook";
import type { Env } from "./env";
import { createPaymentMaintenance } from "./payment-maintenance";
import { createRefundService, refundGatewaysFromEnv } from "./refund-service";
import { createStorefrontService } from "./storefront-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const SECRETS = {
  orderTokenSecret: "segredo-de-teste-do-token-do-pedido",
  phoneLookupIpSalt: "sal-de-teste-do-ip-da-busca",
};
const KEYS = {
  ABACATEPAY_API_KEY: "abc_teste",
  ABACATEPAY_WEBHOOK_SECRET: "segredo-webhook-teste",
  ABACATEPAY_SIGNING_KEY: "chave-publica-teste",
  ABACATEPAY_PUBLIC_KEY: "pk_dev_publica_teste",
  EFI_CLIENT_ID: "efi-client-id-teste",
  EFI_CLIENT_SECRET: "efi-client-secret-teste",
  EFI_PAYEE_CODE: "0123456789abcdef0123456789abcdef",
  EFI_ENVIRONMENT: "sandbox",
  EFI_NOTIFICATION_SECRET: "segredo-notificacao-efi-teste",
  API_PUBLIC_URL: "https://api.foode.test",
};
const EFI_BASE = "https://cobrancas-h.api.efipay.com.br";
const ABACATE_BASE = "https://api.abacatepay.com/v2";
const CPF = "52998224725";
// Quinta-feira, 12:00 em São Paulo.
const OPEN_NOW = new Date("2026-11-05T15:00:00.000Z");
/** 2 × R$ 25,90 + tarifa de serviço R$ 1,50. */
const ORDER_TOTAL = 5180;
const CHARGED = ORDER_TOTAL + 150;

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let orders: OrderService;
let coupons: CouponService;
let owner: PainelCaller;
let operator: PainelCaller;
let ownerB: PainelCaller;
let itemId: string;
let itemIdB: string;
let now: Date;
let efiCharges: Map<number, { amount: number; customId: string }>;
let efiStatus: Map<number, string>;
let efiHistory: Map<string, unknown[]>;
let abacateCharges: Map<string, { amount: number; intentId: string }>;
let pixCheckStatus: string;
/** Chamadas de Estorno recebidas pelos fakes (id da cobrança). */
let abacateRefunds: string[];
let efiRefunds: number[];
let abacateRefundFails: boolean;
let efiRefundFails: boolean;
/** Desfecho do próximo one-step da Efí: aprovado, em análise ou sem resposta (rede). */
let efiOneStep: "approved" | "waiting" | "network";
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

/** Efí e AbacatePay fakes no limite HTTP (Turnstile segue o fake do 24a). */
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
    const chargeId = Number(efiRefund[1]);
    efiRefunds.push(chargeId);
    if (efiRefundFails) return json({ error: "erro_interno" }, 500);
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
  if (url.startsWith(`${EFI_BASE}/v1/notification/`)) {
    const token = decodeURIComponent(url.slice(`${EFI_BASE}/v1/notification/`.length));
    return json({ code: 200, data: efiHistory.get(token) ?? [] });
  }
  if (url === `${ABACATE_BASE}/transparents/create`) {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      data: { amount: number; expiresIn?: number; metadata: { intentId: string } };
    };
    const pix = body.method === "PIX";
    const id = `${pix ? "pix_char" : "card"}_${crypto.randomUUID().replaceAll("-", "")}`;
    abacateCharges.set(id, { amount: body.data.amount, intentId: body.data.metadata.intentId });
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
            status: "APPROVED",
            devMode: true,
            brand: "mastercard",
            lastFour: "5454",
            platformFee: 385,
            metadata: body.data.metadata,
          },
    });
  }
  if (url.startsWith(`${ABACATE_BASE}/transparents/check`)) {
    return json({ success: true, error: null, data: { status: pixCheckStatus } });
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
  payer: { cpf: CPF, email: "ana@exemplo.com" },
  brand: "mastercard" as const,
  lastFour: "5454",
});

/** Cria o Pedido e devolve id (pelo token, como a página do Pedido) e token. */
async function createOrder(slug: string, request: ReturnType<typeof body>) {
  const reply = await storefront().create(slug, request);
  const parsed = checkoutCreateResponseSchema.parse(reply.body);
  if (!parsed.ok) throw new Error(`esperava ok: ${JSON.stringify(parsed.error)}`);
  const found = await db.storefront.orderByTokenHash(slug, await sha256Hex(parsed.accessToken));
  return { orderId: found!.order.id, token: parsed.accessToken };
}

async function abacateWebhook(
  chargeId: string,
  event: "transparent.completed" | "transparent.refunded",
  eventId = `log_${crypto.randomUUID()}`,
) {
  const charge = abacateCharges.get(chargeId)!;
  const pix = chargeId.startsWith("pix_char");
  const rawBody = JSON.stringify({
    id: eventId,
    event,
    apiVersion: 2,
    devMode: true,
    data: {
      transparent: {
        id: chargeId,
        amount: charge.amount,
        status: event === "transparent.refunded" ? "REFUNDED" : pix ? "PAID" : "APPROVED",
        method: pix ? "PIX" : "CARD",
        platformFee: 54,
        metadata: { intentId: charge.intentId },
      },
    },
  });
  return pixService().handleWebhook({
    rawBody,
    querySecret: KEYS.ABACATEPAY_WEBHOOK_SECRET,
    signature: await signAbacatePayBody(rawBody, KEYS.ABACATEPAY_SIGNING_KEY),
  });
}

/** PIX criado e pago pelo webhook (Pedido entra na fila do Painel). */
async function paidPix(overrides: Partial<CheckoutCreateRequestInput> = {}) {
  const order = await createOrder(fx.storeA.slug, body(itemId, { method: "pix" }, overrides));
  const intent = (await db.payments.pixIntentOfOrder(order.orderId))!;
  const reply = await abacateWebhook(intent.providerChargeId!, "transparent.completed");
  expect(reply.body).toEqual({ ok: true, outcome: "applied" });
  return { ...order, intentId: intent.intentId, chargeId: intent.providerChargeId! };
}

function cancel(
  caller: PainelCaller,
  orderId: string,
  extra: { reason?: string; from?: string } = {},
) {
  return orders.ordersCancel(caller, { orderId, ...extra } as never);
}

beforeEach(async () => {
  now = OPEN_NOW;
  efiCharges = new Map();
  efiStatus = new Map();
  efiHistory = new Map();
  abacateCharges = new Map();
  pixCheckStatus = "EXPIRED";
  abacateRefunds = [];
  efiRefunds = [];
  abacateRefundFails = false;
  efiRefundFails = false;
  efiOneStep = "approved";
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
  const ops = db.ops((await db.access.opsContext(fx.ops.id))!);
  await ops.updateStore(fx.storeA.id, storeProfileFixture());
  await ops.updateStore(fx.storeB.id, storeProfileFixture());
  // Loja A no Normal (Efí) com PIX; Loja B no Rápido (AbacatePay).
  await ops.setCardMode(fx.storeA.id, "normal");
  await ops.setCardMode(fx.storeB.id, "rapido");
  owner = await loginAs(fx.ownerA);
  operator = await loginAs(fx.operatorA);
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
  vi.restoreAllMocks();
});

describe("contrato único (Dono e Operador) e Pagamento na entrega", () => {
  it("Operador cancela com motivo; só o Pedido muda; cancelar de novo = conflict", async () => {
    const { orderId } = await createOrder(fx.storeA.slug, body(itemId, { method: "on_delivery" }));
    const before = data(await orders.ordersGet(operator, { orderId }));
    expect(before.cancelPreview).toEqual({ kind: "on_delivery", text: "O Pedido será cancelado." });

    const result = data(await cancel(operator, orderId, { reason: "no_courier" }));
    expect(cancelOrderResultSchema.parse(result)).toEqual({
      status: "cancelled",
      next: [],
      print: false,
      reason: "no_courier",
      consequence: { kind: "on_delivery" },
    });
    await expect(cancel(owner, orderId)).resolves.toEqual({ ok: false, error: "conflict" });

    const detail = data(await orders.ordersGet(owner, { orderId }));
    expect(detail).toMatchObject({
      status: "cancelled",
      cancellable: false,
      cancelPreview: null,
      cancellation: { reason: "no_courier" },
      refund: null,
    });
    expect(detail.history.at(-1)).toMatchObject({
      from: "received",
      to: "cancelled",
      actor: { role: "operator" },
    });
    expect(await db.refunds.ofOrder(orderId)).toEqual([]);
    expect(abacateRefunds).toEqual([]);
    expect(efiRefunds).toEqual([]);
  });

  it("Dono cancela sem motivo; `from` diferente do atual = conflict sem gravar", async () => {
    const { orderId } = await createOrder(fx.storeA.slug, body(itemId, { method: "on_delivery" }));
    data(await orders.ordersTransition(owner, { orderId, from: "received", to: "preparing" }));
    await expect(cancel(owner, orderId, { from: "received" })).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    await expect(cancel(owner, orderId, { reason: "pix_expired" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(data(await cancel(owner, orderId, { from: "preparing" })).reason).toBeNull();
    expect(await db.refunds.cancellationOf(orderId)).toMatchObject({
      reason: null,
      actorRole: "owner",
    });
  });
});

describe("PIX pago → Estorno total na AbacatePay", () => {
  it("obrigação antes do provedor, total com tarifa, Ledger anulado, webhook idempotente", async () => {
    const { orderId, intentId, chargeId } = await paidPix();
    const preview = data(await orders.ordersGet(owner, { orderId })).cancelPreview;
    expect(preview).toMatchObject({ kind: "refund", amountCents: CHARGED });

    const result = data(await cancel(owner, orderId, { reason: "item_unavailable" }));
    expect(result.consequence).toEqual({
      kind: "refund",
      refund: { state: "pending", amountCents: CHARGED },
    });
    expect(abacateRefunds).toEqual([chargeId]);
    const [refund] = await db.refunds.ofOrder(orderId);
    expect(refund).toMatchObject({
      provider: "abacatepay",
      method: "pix",
      providerChargeId: chargeId,
      amountCents: CHARGED,
      serviceFeeCents: 150,
      idempotencyKey: `refund:${intentId}`,
      origin: "order_cancelled",
      state: "requested",
    });

    // Cancelar de novo: nenhum segundo Estorno.
    await expect(cancel(operator, orderId)).resolves.toEqual({ ok: false, error: "conflict" });
    expect(abacateRefunds).toHaveLength(1);
    expect(await db.refunds.ofOrder(orderId)).toHaveLength(1);

    // Ledger: o lançamento continua; a anulação tem os mesmos valores.
    const [entry] = await db.payments.ledgerOfIntent(intentId);
    expect(entry).toMatchObject({ chargedCents: CHARGED, serviceFeeCents: 150 });
    const reversals = await db.refunds.reversalsOfOrder(orderId);
    expect(reversals).toEqual([
      expect.objectContaining({
        kind: "annulment",
        chargedCents: CHARGED,
        serviceFeeCents: 150,
        netCents: entry!.netCents,
        foodeFeeCents: entry!.foodeFeeCents,
        expectedPayoutDate: entry!.expectedPayoutDate,
      }),
    ]);

    // Webhook de Estorno: aplica uma vez; reentrega = duplicata; outro evento = já aplicado.
    const eventId = `log_${crypto.randomUUID()}`;
    await expect(abacateWebhook(chargeId, "transparent.refunded", eventId)).resolves.toEqual({
      status: 200,
      body: { ok: true, outcome: "applied" },
    });
    await expect(abacateWebhook(chargeId, "transparent.refunded", eventId)).resolves.toEqual({
      status: 200,
      body: { ok: true, outcome: "duplicate" },
    });
    await expect(abacateWebhook(chargeId, "transparent.refunded")).resolves.toEqual({
      status: 200,
      body: { ok: true, outcome: "already_applied" },
    });
    expect((await db.refunds.ofOrder(orderId))[0]?.state).toBe("succeeded");

    const detail = data(await orders.ordersGet(owner, { orderId }));
    expect(detail).toMatchObject({
      status: "cancelled",
      cancellation: { reason: "item_unavailable" },
      refund: { state: "succeeded", amountCents: CHARGED },
    });
    const closed = data(await orders.ordersList(operator, { scope: "closed_today" }));
    expect(closed.orders.find((o) => o.id === orderId)?.refund).toEqual({ state: "succeeded" });
  });

  it("já repassado: débito compensado no próximo dia útil; lançamento original preservado", async () => {
    const { orderId, intentId } = await paidPix();
    await markLedgerPaidOut(env.DB, intentId, OPEN_NOW.toISOString());
    data(await cancel(owner, orderId));
    const [entry] = await db.payments.ledgerOfIntent(intentId);
    expect(entry).toBeDefined();
    expect(await db.refunds.reversalsOfOrder(orderId)).toEqual([
      expect.objectContaining({
        kind: "compensated_debit",
        netCents: entry!.netCents,
        chargedCents: CHARGED,
        // Quinta 2026-11-05 → sexta 2026-11-06.
        expectedPayoutDate: "2026-11-06",
      }),
    ]);
  });

  it("falha do provedor não reabre o Pedido; retentativa automática com backoff", async () => {
    const { orderId, chargeId } = await paidPix();
    abacateRefundFails = true;
    const result = data(await cancel(owner, orderId));
    expect(result.consequence).toEqual({
      kind: "refund",
      refund: { state: "failed_retrying", amountCents: CHARGED },
    });
    expect(data(await orders.ordersGet(owner, { orderId })).status).toBe("cancelled");
    const [failed] = await db.refunds.ofOrder(orderId);
    expect(failed).toMatchObject({ state: "failed", attempts: 1 });
    expect(failed?.lastErrorCode).not.toContain(chargeId);

    abacateRefundFails = false;
    // Dentro do backoff: nada.
    await expect(refundService().retryPendingRefunds(now)).resolves.toMatchObject({
      attempted: 0,
    });
    now = new Date(OPEN_NOW.getTime() + 2 * 60_000);
    await expect(refundService().retryPendingRefunds(now)).resolves.toMatchObject({
      attempted: 1,
      requested: 1,
    });
    expect(abacateRefunds).toEqual([chargeId, chargeId]);
    expect((await db.refunds.ofOrder(orderId))[0]).toMatchObject({
      state: "requested",
      attempts: 2,
    });
  });
});

describe("Cartão → provedor da cobrança gravada", () => {
  it("Normal (Efí): Estorno total na Efí; notificação `refunded` conclui (repetida = sem efeito)", async () => {
    const { orderId } = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "credit", card: efiCard() }),
    );
    const intent = (await db.cardPayments.latestOfOrder(orderId))!;
    expect(intent.intentState).toBe("paid");
    const chargeId = Number(intent.providerChargeId);

    const result = data(await cancel(owner, orderId, { reason: "customer_request" }));
    expect(result.consequence).toMatchObject({ kind: "refund", refund: { amountCents: CHARGED } });
    expect(efiRefunds).toEqual([chargeId]);
    expect(abacateRefunds).toEqual([]);
    expect((await db.refunds.ofOrder(orderId))[0]).toMatchObject({
      provider: "efi",
      method: "credit",
      cardMode: "normal",
      state: "requested",
    });

    const charge = efiCharges.get(chargeId)!;
    const token = `tok-${crypto.randomUUID()}`;
    efiHistory.set(token, [
      {
        id: 1,
        type: "charge",
        custom_id: charge.customId,
        status: { current: "approved", previous: "waiting" },
        identifiers: { charge_id: chargeId },
        created_at: "2026-11-05 12:00:00",
      },
      {
        id: 2,
        type: "charge",
        custom_id: charge.customId,
        status: { current: "refunded", previous: "approved" },
        identifiers: { charge_id: chargeId },
        created_at: "2026-11-05 12:05:00",
      },
    ]);
    const notify = () =>
      cardService().handleEfiNotification({
        rawBody: `notification=${token}`,
        contentType: "application/x-www-form-urlencoded",
        querySecret: KEYS.EFI_NOTIFICATION_SECRET,
      });
    expect((await notify()).status).toBe(200);
    expect((await db.refunds.ofOrder(orderId))[0]?.state).toBe("succeeded");
    await expect(notify()).resolves.toMatchObject({ body: { outcome: "duplicate" } });
    expect(efiRefunds).toHaveLength(1);
    // Aprovação não regride: o Pedido segue cancelado.
    expect(data(await orders.ordersGet(owner, { orderId })).status).toBe("cancelled");
  });

  it("Rápido (AbacatePay) na Loja B; Dono de B não cancela Pedido de A", async () => {
    const a = await paidPix();
    const { orderId } = await createOrder(
      fx.storeB.slug,
      body(itemIdB, { method: "credit", card: abacateCard() }),
    );
    const intent = (await db.cardPayments.latestOfOrder(orderId))!;
    expect(intent.intentState).toBe("paid");

    await expect(cancel(ownerB, a.orderId)).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(orders.ordersGet(ownerB, { orderId: a.orderId })).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    expect(data(await orders.ordersGet(owner, { orderId: a.orderId })).status).toBe("received");
    expect(await db.refunds.ofOrder(a.orderId)).toEqual([]);

    data(await cancel(ownerB, orderId));
    expect(abacateRefunds).toEqual([intent.providerChargeId]);
    expect((await db.refunds.ofOrder(orderId))[0]).toMatchObject({
      provider: "abacatepay",
      method: "credit",
      cardMode: "rapido",
      storeId: fx.storeB.id,
    });
  });
});

describe("PIX vencido sem pagamento", () => {
  it("vira Cancelado (sistema), libera o Cupom; idempotente; pagamento tardio → Estorno total", async () => {
    data(
      await coupons.couponCreate(owner, {
        code: "DEZ",
        kind: "fixed",
        amountCents: 200,
        usageLimit: 1,
      } as never),
    );
    const { orderId } = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "pix" }, { couponCode: "DEZ" }),
    );
    expect(data(await coupons.couponsGet(owner)).coupons[0]?.usedCount).toBe(1);
    const intent = (await db.payments.pixIntentOfOrder(orderId))!;
    expect(intent.state).toBe("pending");

    // Antes do vencimento: nada.
    await expect(pixService().expireUnpaidPix(now)).resolves.toEqual({
      cancelled: 0,
      paid: 0,
      skipped: 0,
    });
    now = new Date(Date.parse(intent.expiresAt!) + 1_000);
    await expect(pixService().expireUnpaidPix(now)).resolves.toMatchObject({ cancelled: 1 });
    await expect(pixService().expireUnpaidPix(now)).resolves.toMatchObject({ cancelled: 0 });
    expect(await db.refunds.cancellationOf(orderId)).toMatchObject({
      reason: "pix_expired",
      actorUserId: null,
    });
    expect(data(await coupons.couponsGet(owner)).coupons[0]?.usedCount).toBe(0);
    // O Cupom voltou a valer para outro Pedido.
    now = OPEN_NOW;
    await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "on_delivery" }, { couponCode: "DEZ" }),
    );

    // Pagamento que chega depois: Estorno total do que foi pago (Pedido segue cancelado).
    const reply = await abacateWebhook(intent.providerChargeId!, "transparent.completed");
    expect(reply.body).toEqual({ ok: true, outcome: "applied" });
    const [refund] = await db.refunds.ofOrder(orderId);
    expect(refund).toMatchObject({
      origin: "late_payment",
      amountCents: ORDER_TOTAL - 200 + 150,
      state: "requested",
    });
    expect(abacateRefunds).toEqual([intent.providerChargeId]);
    const detail = data(await orders.ordersGet(owner, { orderId }));
    expect(detail).toMatchObject({
      status: "cancelled",
      cancellation: { reason: "pix_expired" },
      refund: { state: "pending" },
    });
    expect(await db.refunds.reversalsOfOrder(orderId)).toEqual([
      expect.objectContaining({ kind: "annulment" }),
    ]);
  });
});

describe("Cartão sem desfecho (varredura do Cron)", () => {
  const maintenance = () =>
    createPaymentMaintenance(env as unknown as Env, { fetch: viaGlobalFetch });

  it("processing além de 5 min vira recusado; em análise é conferido e aprovado; idempotente", async () => {
    efiOneStep = "network";
    const lost = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "credit", card: efiCard() }),
    );
    expect((await db.cardPayments.latestOfOrder(lost.orderId))?.state).toBe("processing");
    efiOneStep = "waiting";
    const waiting = await createOrder(
      fx.storeA.slug,
      body(itemId, { method: "credit", card: efiCard() }),
    );
    const pending = (await db.cardPayments.latestOfOrder(waiting.orderId))!;
    expect(pending.state).toBe("pending");

    // Antes do prazo: nada (a varredura usa o relógio passado, não o da página).
    await expect(maintenance().expireStaleCardAttempts(OPEN_NOW)).resolves.toEqual({
      gaveUp: 0,
      checked: 0,
      failed: 0,
    });

    efiStatus.set(Number(pending.providerChargeId), "approved");
    const later = new Date(OPEN_NOW.getTime() + 6 * 60_000);
    await expect(maintenance().expireStaleCardAttempts(later)).resolves.toEqual({
      gaveUp: 1,
      checked: 1,
      failed: 0,
    });
    expect(await db.cardPayments.latestOfOrder(lost.orderId)).toMatchObject({
      state: "declined",
      declineReason: "provider_unavailable",
    });
    expect(await db.cardPayments.latestOfOrder(waiting.orderId)).toMatchObject({
      state: "approved",
      intentState: "paid",
    });
    // Repetir não muda nada.
    await expect(maintenance().expireStaleCardAttempts(later)).resolves.toEqual({
      gaveUp: 0,
      checked: 0,
      failed: 0,
    });
  });
});
