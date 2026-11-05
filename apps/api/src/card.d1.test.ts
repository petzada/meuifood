// Ticket 27 no workerd com D1 (só no CI): Cartão à vista ponta a ponta com Efí (Normal) e
// AbacatePay (Rápido) fakes no limite HTTP. Prova: Crédito só com taxa Foode do modo E chaves do
// provedor do modo; 1ª tentativa na mesma escrita do Pedido (replay não cobra de novo); aprovado,
// pendente e recusado distintos na página do Pedido; "Tentar outro cartão" idempotente; só a
// confirmação canônica marca pago; notificação da Efí e webhook da AbacatePay repetidos/fora de
// ordem sem efeito duplo nem regressão; Ledger com liberação do modo; isolamento entre Lojas.
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
import { abacatePayCardFromEnv, createCardService, efiCardFromEnv } from "./card-service";
import type { EmailSender } from "./email/sender";
import { createMenuService } from "./menu-service";
import { createOrderService, type OrderService } from "./order-service";
import { abacatePayFromEnv, createPixService } from "./pix-service";
import { signAbacatePayBody } from "./providers/abacatepay/webhook";
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
const CPF = "52998224725";
// Quinta-feira, 12:00 em São Paulo.
const OPEN_NOW = new Date("2026-11-05T15:00:00.000Z");

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let orders: OrderService;
let owner: PainelCaller;
let ownerB: PainelCaller;
let itemId: string;
let itemIdB: string;
let now: Date;
/** Status que o próximo one-step da Efí devolve. */
let efiOneStepStatus: string;
/** Cobranças criadas nos fakes: id → valor e chave nossa. */
let efiCharges: Map<number, { amount: number; customId: string; notificationUrl: string }>;
let abacateCharges: Map<string, { amount: number; intentId: string }>;
let abacateCreateStatus: string;
/** Cobranças PIX do "Pagar com PIX". */
let pixCharges: Map<string, { amount: number; intentId: string }>;
/** Histórico de cada token de notificação da Efí. */
let efiHistory: Map<string, unknown[]>;
const realFetch = globalThis.fetch;
/** `charge_id` da Efí fake: nunca reiniciado entre testes (dados únicos por teste). */
let efiChargeSeq = 900_000 + Math.floor(Math.random() * 1_000_000) * 100;

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
    const body = JSON.parse(String(init?.body)) as {
      items: { value: number }[];
      metadata: { custom_id: string; notification_url: string };
    };
    // Único no arquivo inteiro: o D1 do workerd é compartilhado entre os testes e
    // `payment_intents (provider, provider_charge_id)` é UNIQUE.
    efiChargeSeq += 1;
    const chargeId = efiChargeSeq;
    const amount = body.items[0]!.value;
    efiCharges.set(chargeId, {
      amount,
      customId: body.metadata.custom_id,
      notificationUrl: body.metadata.notification_url,
    });
    return json({
      code: 200,
      data: {
        charge_id: chargeId,
        status: efiOneStepStatus,
        total: amount,
        custom_id: body.metadata.custom_id,
        ...(efiOneStepStatus === "unpaid"
          ? { refusal: { reason: "Transação não autorizada", retry: true } }
          : {}),
      },
    });
  }
  if (url.startsWith(`${EFI_BASE}/v1/notification/`)) {
    const token = decodeURIComponent(url.slice(`${EFI_BASE}/v1/notification/`.length));
    return json({ code: 200, data: efiHistory.get(token) ?? [] });
  }
  if (url.startsWith("https://api.abacatepay.com/v2/transparents/get")) {
    // Consulta autenticada da página do Pedido: segue em análise até o webhook.
    const id = new URL(url).searchParams.get("id") ?? "";
    const charge = abacateCharges.get(id);
    return json({
      success: true,
      error: null,
      data: { id, amount: charge?.amount ?? 0, status: "PENDING", devMode: true, metadata: {} },
    });
  }
  if (url === "https://api.abacatepay.com/v2/transparents/create") {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      data: { amount: number; expiresIn?: number; metadata: { intentId: string } };
    };
    if (body.method === "PIX") {
      const id = `pix_char_${crypto.randomUUID().replaceAll("-", "")}`;
      pixCharges.set(id, { amount: body.data.amount, intentId: body.data.metadata.intentId });
      return json({
        success: true,
        error: null,
        data: {
          id,
          amount: body.data.amount,
          status: "PENDING",
          devMode: true,
          brCode: `000201-${id}`,
          brCodeBase64: "data:image/png;base64,iVBORw0KGgo=",
          platformFee: 54,
          expiresAt: new Date(now.getTime() + (body.data.expiresIn ?? 1800) * 1000).toISOString(),
          metadata: body.data.metadata,
        },
      });
    }
    if (abacateCreateStatus === "DECLINED") {
      return json(
        { success: false, error: "Não foi possível processar o pagamento com este cartão" },
        400,
      );
    }
    const id = `card_${crypto.randomUUID().replaceAll("-", "")}`;
    abacateCharges.set(id, { amount: body.data.amount, intentId: body.data.metadata.intentId });
    return json({
      success: true,
      error: null,
      data: {
        id,
        amount: body.data.amount,
        status: abacateCreateStatus,
        devMode: true,
        brand: "mastercard",
        lastFour: "5454",
        platformFee: 385,
        metadata: body.data.metadata,
      },
    });
  }
  return realFetch(input, init);
}

const viaGlobalFetch = (url: string, init: RequestInit) => globalThis.fetch(url, init);

function cardService(keys: Partial<typeof KEYS> = KEYS) {
  return createCardService({
    db,
    efi: efiCardFromEnv(keys, viaGlobalFetch),
    abacatePay: abacatePayCardFromEnv(keys, viaGlobalFetch),
    now: () => now,
  });
}

function pixService(keys: Partial<typeof KEYS> = KEYS) {
  return createPixService({
    db,
    provider: abacatePayFromEnv(keys, viaGlobalFetch),
    card: cardService(keys),
    now: () => now,
  });
}

function storefront(keys: Partial<typeof KEYS> = KEYS) {
  return createStorefrontService({
    db,
    turnstile: { verify: async () => true },
    ...SECRETS,
    pix: pixService(keys),
    card: cardService(keys),
    now: () => now,
  });
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

function cardBody(
  item: string,
  card: ReturnType<typeof efiCard> | ReturnType<typeof abacateCard>,
  overrides: Partial<CheckoutCreateRequestInput> = {},
) {
  return {
    idempotencyKey: crypto.randomUUID(),
    lines: [{ itemId: item, quantity: 2, complementSelections: {}, additionalIds: [] }],
    fulfillment: "pickup",
    customer: { name: "Maria Souza", phone: "(11) 91234-5678" },
    payment: { method: "credit", card },
    note: null,
    ...overrides,
  } satisfies CheckoutCreateRequestInput;
}

async function createCard(slug: string, body: ReturnType<typeof cardBody>) {
  const reply = await storefront().create(slug, body);
  const parsed = checkoutCreateResponseSchema.parse(reply.body);
  if (!parsed.ok) throw new Error(`esperava ok: ${JSON.stringify(parsed.error)}`);
  return { reply, created: parsed };
}

async function track(slug: string, token: string) {
  return orderTrackingSchema.parse((await storefront().track(slug, token)).body);
}

function efiEvent(id: number, chargeId: number, current: string, previous: string | null) {
  const charge = efiCharges.get(chargeId)!;
  return {
    id,
    type: "charge",
    custom_id: charge.customId,
    status: { current, previous },
    identifiers: { charge_id: chargeId },
    created_at: "2026-11-05 12:00:00",
  };
}

async function notifyEfi(token: string, secret = KEYS.EFI_NOTIFICATION_SECRET) {
  return cardService().handleEfiNotification({
    rawBody: `notification=${token}`,
    contentType: "application/x-www-form-urlencoded",
    querySecret: secret,
  });
}

async function abacateWebhook(chargeId: string, status: string, eventId: string) {
  const charge = abacateCharges.get(chargeId)!;
  const rawBody = JSON.stringify({
    id: eventId,
    event: "transparent.completed",
    apiVersion: 2,
    devMode: true,
    data: {
      transparent: {
        id: chargeId,
        amount: charge.amount,
        status,
        method: "CARD",
        platformFee: 385,
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

async function ledgerOf(storeId: string) {
  return (await db.payments.paymentsOfStore(storeId)).ledger;
}

function retry(slug: string, token: string, card: unknown, attemptKey = crypto.randomUUID()) {
  return cardService().retry({ slug, token, body: { attemptKey, card } });
}

beforeEach(async () => {
  now = OPEN_NOW;
  efiOneStepStatus = "approved";
  abacateCreateStatus = "APPROVED";
  efiCharges = new Map();
  abacateCharges = new Map();
  pixCharges = new Map();
  efiHistory = new Map();
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  orders = createOrderService({ db, auth, orderTokenSecret: SECRETS.orderTokenSecret });
  vi.spyOn(globalThis, "fetch").mockImplementation(fakeFetch);
  const ops = db.ops((await db.access.opsContext(fx.ops.id))!);
  await ops.updateStore(fx.storeA.id, storeProfileFixture());
  await ops.updateStore(fx.storeB.id, storeProfileFixture());
  // Loja A no Normal (Efí), Loja B no Rápido (AbacatePay); taxas da decisão 76 só por modo.
  await ops.setCardMode(fx.storeA.id, "normal");
  await ops.setCardMode(fx.storeB.id, "rapido");
  owner = await loginAs(fx.ownerA);
  ownerB = await loginAs(fx.ownerB);
  itemId = await configureStore(owner);
  itemIdB = await configureStore(ownerB);
  const validFrom = "2020-01-01T00:00:00.000Z";
  await ops.createPaymentFees(fx.storeA.id, [
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

describe("disponibilidade (decisões 60, 61 e 76)", () => {
  it("Crédito só com taxa do modo E chaves do provedor do modo; tokenizador do modo", async () => {
    const a = storefrontStoreStateSchema.parse((await storefront().state(fx.storeA.slug)).body);
    expect(a.paymentMethods).toEqual(["credit", "on_delivery"]);
    expect(a.cardTokenizer).toEqual({
      sdk: "efi",
      payeeCode: KEYS.EFI_PAYEE_CODE,
      environment: "sandbox",
    });
    const b = storefrontStoreStateSchema.parse((await storefront().state(fx.storeB.slug)).body);
    expect(b.cardTokenizer).toEqual({ sdk: "abacatepay", publicKey: KEYS.ABACATEPAY_PUBLIC_KEY });

    // Sem as chaves da Efí, a Loja Normal perde o Crédito (a Rápida não).
    const noEfi = { ...KEYS, EFI_CLIENT_SECRET: "" };
    const aNoKeys = storefrontStoreStateSchema.parse(
      (await storefront(noEfi).state(fx.storeA.slug)).body,
    );
    expect(aNoKeys).toMatchObject({ paymentMethods: ["on_delivery"], cardTokenizer: null });
    await expect(
      storefront(noEfi).create(fx.storeA.slug, cardBody(itemId, efiCard())),
    ).resolves.toMatchObject({ status: 422 });

    // SDK do navegador diferente do modo da Loja: indisponível, nada gravado nem cobrado.
    await expect(
      storefront().create(fx.storeA.slug, cardBody(itemId, abacateCard())),
    ).resolves.toMatchObject({
      status: 422,
      body: { ok: false, error: { code: "payment_method_unavailable" } },
    });
    expect(efiCharges.size + abacateCharges.size).toBe(0);
  });

  it("número/CVV no corpo é recusado pelo schema (400), sem chamar ninguém", async () => {
    const body = cardBody(itemId, efiCard());
    const leaked = {
      ...body,
      payment: {
        ...body.payment,
        card: { ...body.payment.card, number: "4111111111111111", cvv: "123" },
      },
    };
    await expect(storefront().create(fx.storeA.slug, leaked)).resolves.toMatchObject({
      status: 400,
    });
    expect(efiCharges.size).toBe(0);
  });
});

describe("Normal (Efí)", () => {
  it("aprovado: uma cobrança, Pedido pago na fila, Ledger em 21 dias úteis; replay não cobra", async () => {
    const body = cardBody(itemId, efiCard());
    const { reply, created } = await createCard(fx.storeA.slug, body);
    expect(reply.status).toBe(201);
    expect(efiCharges.size).toBe(1);
    const [charge] = [...efiCharges.values()];
    expect(charge?.amount).toBe(5180 + 150);
    expect(charge?.notificationUrl).toBe(
      `${KEYS.API_PUBLIC_URL}/webhooks/efi?secret=${KEYS.EFI_NOTIFICATION_SECRET}`,
    );

    await expect(storefront().create(fx.storeA.slug, body)).resolves.toMatchObject({
      status: 200,
      body: { ok: true, replayed: true },
    });
    expect(efiCharges.size).toBe(1);

    const page = await track(fx.storeA.slug, created.accessToken);
    expect(page.card).toEqual({
      state: "approved",
      amountCents: 5330,
      brand: "visa",
      lastFour: "4242",
      declineReason: null,
      retryActions: [],
      tokenizer: null,
    });
    expect(JSON.stringify(page)).not.toContain(CPF);

    const [entry] = await ledgerOf(fx.storeA.id);
    const [row] = await db.payments.ledgerOfIntent(entry!.intentId);
    expect(row).toMatchObject({
      chargedCents: 5330,
      orderTotalCents: 5180,
      serviceFeeCents: 150,
      foodeFeeCents: 280,
      netCents: 4900,
      releaseDate: "2026-12-07",
      expectedPayoutDate: "2026-12-08",
      provider: "efi",
      method: "credit",
    });
    expect(data(await orders.ordersList(owner)).orders).toHaveLength(1);
    expect(data(await orders.ordersList(ownerB)).orders).toHaveLength(0);
  });

  it("recusado → Tentar outro cartão (idempotente) → aprovado; nova tentativa depois = 409", async () => {
    efiOneStepStatus = "unpaid";
    const { created } = await createCard(fx.storeA.slug, cardBody(itemId, efiCard()));
    const declined = await track(fx.storeA.slug, created.accessToken);
    expect(declined.card).toMatchObject({
      state: "declined",
      declineReason: "issuer_declined",
      retryActions: ["other_card"],
      tokenizer: { sdk: "efi" },
    });
    expect(data(await orders.ordersList(owner)).orders).toHaveLength(0);

    efiOneStepStatus = "approved";
    const attemptKey = crypto.randomUUID();
    await expect(
      retry(fx.storeA.slug, created.accessToken, efiCard(), attemptKey),
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      retry(fx.storeA.slug, created.accessToken, efiCard(), attemptKey),
    ).resolves.toMatchObject({ status: 200 });
    expect(efiCharges.size).toBe(2);
    expect((await track(fx.storeA.slug, created.accessToken)).card?.state).toBe("approved");
    await expect(retry(fx.storeA.slug, created.accessToken, efiCard())).resolves.toMatchObject({
      status: 409,
      body: { error: "attempt_active" },
    });
    expect(await ledgerOf(fx.storeA.id)).toHaveLength(1);
  });

  it("em análise → notificação aprova; repetida e fora de ordem não duplicam nem regridem", async () => {
    efiOneStepStatus = "waiting";
    const { created } = await createCard(fx.storeA.slug, cardBody(itemId, efiCard()));
    expect((await track(fx.storeA.slug, created.accessToken)).card?.state).toBe("pending");
    const [chargeId] = [...efiCharges.keys()];
    const token = `tok-${crypto.randomUUID()}`;

    await expect(notifyEfi(token, "errado")).resolves.toMatchObject({ status: 401 });

    efiHistory.set(token, [
      efiEvent(2, chargeId!, "approved", "waiting"),
      efiEvent(1, chargeId!, "waiting", "new"),
    ]);
    await expect(notifyEfi(token)).resolves.toMatchObject({ body: { outcome: "applied" } });
    await expect(notifyEfi(token)).resolves.toMatchObject({ body: { outcome: "duplicate" } });
    // Depois de pago, um `unpaid` atrasado e um `paid` não mudam nada.
    efiHistory.set(token, [
      efiEvent(1, chargeId!, "waiting", "new"),
      efiEvent(2, chargeId!, "approved", "waiting"),
      efiEvent(3, chargeId!, "unpaid", "approved"),
      efiEvent(4, chargeId!, "paid", "approved"),
    ]);
    await expect(notifyEfi(token)).resolves.toMatchObject({
      body: { outcome: "already_applied" },
    });
    expect((await track(fx.storeA.slug, created.accessToken)).card?.state).toBe("approved");
    expect(await ledgerOf(fx.storeA.id)).toHaveLength(1);
  });
});

describe("Rápido (AbacatePay)", () => {
  it("pendente → webhook CARD aprova uma vez; duplicata sem efeito; Ledger D+1 útil", async () => {
    abacateCreateStatus = "PENDING";
    const { created } = await createCard(fx.storeB.slug, cardBody(itemIdB, abacateCard()));
    expect((await track(fx.storeB.slug, created.accessToken)).card?.state).toBe("pending");
    const [chargeId] = [...abacateCharges.keys()];
    await expect(abacateWebhook(chargeId!, "APPROVED", "log_card_1")).resolves.toMatchObject({
      status: 200,
      body: { outcome: "applied" },
    });
    await expect(abacateWebhook(chargeId!, "APPROVED", "log_card_1")).resolves.toMatchObject({
      body: { outcome: "duplicate" },
    });
    await expect(abacateWebhook(chargeId!, "PAID", "log_card_2")).resolves.toMatchObject({
      body: { outcome: "already_applied" },
    });
    // FAILED atrasado depois de aprovado: não regride.
    await abacateWebhook(chargeId!, "FAILED", "log_card_3");
    expect((await track(fx.storeB.slug, created.accessToken)).card?.state).toBe("approved");
    const ledger = await ledgerOf(fx.storeB.id);
    expect(ledger).toHaveLength(1);
    const [row] = await db.payments.ledgerOfIntent(ledger[0]!.intentId);
    expect(row).toMatchObject({
      chargedCents: 5330,
      foodeFeeCents: 440,
      providerCostCents: 385,
      netCents: 4740,
      releaseDate: "2026-11-06",
      expectedPayoutDate: "2026-11-09",
      provider: "abacatepay",
    });
  });

  it("recusa do emissor: recusado com as ações; Loja B não vê nada da A", async () => {
    abacateCreateStatus = "DECLINED";
    const { created } = await createCard(fx.storeB.slug, cardBody(itemIdB, abacateCard()));
    expect((await track(fx.storeB.slug, created.accessToken)).card).toMatchObject({
      state: "declined",
      declineReason: "issuer_declined",
      retryActions: ["other_card"],
    });
    // Token do Pedido da B na URL da A: 404 sem distinguir.
    await expect(retry(fx.storeA.slug, created.accessToken, efiCard())).resolves.toMatchObject({
      status: 404,
    });
  });
});

describe("Pagar com PIX depois do recusado e CPF da conta", () => {
  async function enablePix(storeId: string) {
    const ops = db.ops((await db.access.opsContext(fx.ops.id))!);
    await ops.createPaymentFees(storeId, [
      {
        method: "pix",
        cardMode: null,
        percentBps: 119,
        fixedCents: 0,
        validFrom: "2020-01-01T00:00:00.000Z",
        validTo: null,
      },
    ]);
  }

  it("recusado oferece PIX; troca idempotente, mesmo total e tarifa, cobrança pelo fluxo do 26", async () => {
    await enablePix(fx.storeA.id);
    efiOneStepStatus = "unpaid";
    const { created } = await createCard(fx.storeA.slug, cardBody(itemId, efiCard()));
    expect((await track(fx.storeA.slug, created.accessToken)).card?.retryActions).toEqual([
      "other_card",
      "pix",
    ]);

    const first = await storefront().payWithPix(fx.storeA.slug, created.accessToken, {});
    expect(first).toMatchObject({ status: 201, body: { ok: true, replayed: false } });
    const again = await storefront().payWithPix(fx.storeA.slug, created.accessToken, undefined);
    expect(again).toMatchObject({ status: 200, body: { ok: true, replayed: true } });
    expect(pixCharges.size).toBe(1);
    expect([...pixCharges.values()][0]?.amount).toBe(5330);

    const page = await track(fx.storeA.slug, created.accessToken);
    expect(page).toMatchObject({
      totalCents: 5180,
      serviceFeeCents: 150,
      payment: { method: "pix" },
      pix: { state: "pending", amountCents: 5330 },
      card: null,
    });
    // Depois da troca, "Tentar outro cartão" não vale mais.
    await expect(retry(fx.storeA.slug, created.accessToken, efiCard())).resolves.toMatchObject({
      status: 409,
      body: { error: "order_not_payable" },
    });
    // Corpo com campos é recusado (schema estrito).
    await expect(
      storefront().payWithPix(fx.storeA.slug, created.accessToken, { method: "pix" }),
    ).resolves.toMatchObject({ status: 400 });
  });

  it("Pedido aprovado não troca; Loja sem PIX = 422; outra Loja = 404", async () => {
    const { created } = await createCard(fx.storeA.slug, cardBody(itemId, efiCard()));
    await enablePix(fx.storeA.id);
    await expect(
      storefront().payWithPix(fx.storeA.slug, created.accessToken, {}),
    ).resolves.toMatchObject({ status: 409, body: { error: "order_not_payable" } });

    abacateCreateStatus = "DECLINED";
    const declinedB = await createCard(fx.storeB.slug, cardBody(itemIdB, abacateCard()));
    expect((await track(fx.storeB.slug, declinedB.created.accessToken)).card?.retryActions).toEqual(
      ["other_card"],
    );
    await expect(
      storefront().payWithPix(fx.storeB.slug, declinedB.created.accessToken, {}),
    ).resolves.toMatchObject({ status: 422, body: { error: "payment_method_unavailable" } });
    await expect(
      storefront().payWithPix(fx.storeA.slug, declinedB.created.accessToken, {}),
    ).resolves.toMatchObject({ status: 404 });
    expect(pixCharges.size).toBe(0);
  });

  it("CPF da conta sem sessão de Consumidor = 422 account_cpf_unavailable, nada gravado", async () => {
    const card = {
      ...efiCard(),
      payer: { useAccountCpf: true as const, email: "a@b.com", birthDate: "1990-05-17" },
    };
    await expect(
      storefront().create(
        fx.storeA.slug,
        cardBody(itemId, card as unknown as ReturnType<typeof efiCard>),
      ),
    ).resolves.toMatchObject({ status: 422, body: { error: "account_cpf_unavailable" } });
    expect(efiCharges.size).toBe(0);
    expect(data(await orders.ordersList(owner)).orders).toHaveLength(0);
  });
});

describe("rota HTTP da notificação da Efí", () => {
  it("segredo errado = 401; corpo sem token = 400; sem eco do corpo", async () => {
    const post = (query: string, body: string) =>
      exports.default.fetch(
        new Request(`https://api.foode.test/webhooks/efi${query}`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        }),
      );
    const denied = await post("?secret=errado", "notification=tok-secreto-123");
    expect(denied.status).toBe(401);
    expect(await denied.text()).not.toContain("tok-secreto");
    const invalid = await post(`?secret=${KEYS.EFI_NOTIFICATION_SECRET}`, "x=1");
    expect(invalid.status).toBe(400);
  });
});
