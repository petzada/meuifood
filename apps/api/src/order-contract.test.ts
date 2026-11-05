// Contrato do Ticket 24a sem banco: limites do D1 = limites de @foode/shared/order (inclusive a
// máquina de estados e as ações de auditoria repetidas em @foode/db); as RPCs de
// Pedido/configuração validam a entrada e autorizam pela política única (Operador pode Pedidos e
// Pausa, não a configuração, sem nenhuma escrita; Ops = `forbidden`); as rotas públicas do
// Storefront validam o corpo antes do banco. Regras com D1 ficam em *.d1.test.ts (CI).
import {
  DELIVERY_MODES,
  ETA_MAX_MINUTES,
  type FoodeDb,
  MENU_MAX_CENTS,
  NEIGHBORHOOD_NAME_MAX,
  ORDER_ADDRESS_COMPLEMENT_MAX,
  ORDER_ADDRESS_NUMBER_MAX,
  ORDER_ADDRESS_REFERENCE_MAX,
  ORDER_CUSTOMER_NAME_MAX,
  ORDER_FULFILLMENTS,
  ORDER_LINE_QUANTITY_MAX,
  ORDER_NOTE_MAX,
  ORDER_PAYMENT_METHODS,
  ORDER_STATUSES,
  ORDER_STREET_MAX,
  ORDER_TRANSITIONS,
  PAUSE_ROLES,
  PHONE_LOOKUP_RESULTS,
  STORE_OPERATION_AUDIT,
} from "@foode/db";
import { MAX_LINE_QUANTITY } from "@foode/shared/menu";
import { MAX_CENTS } from "@foode/shared/money";
import * as order from "@foode/shared/order";
import { describe, expect, it } from "vitest";

import { createApp } from "./app";
import type { AuthSession, FoodeAuth } from "./auth/auth";
import { rolesWith } from "./auth/guard";
import type { Env } from "./env";
import { createOrderService } from "./order-service";

describe("limites do D1 × @foode/shared/order", () => {
  it("enums e tetos iguais", () => {
    expect([...ORDER_STATUSES]).toEqual([...order.ORDER_STATUSES]);
    expect([...ORDER_FULFILLMENTS]).toEqual([...order.FULFILLMENTS]);
    expect([...ORDER_PAYMENT_METHODS]).toEqual([...order.PAYMENT_METHODS]);
    expect([...DELIVERY_MODES]).toEqual([...order.DELIVERY_MODES]);
    expect([...PAUSE_ROLES]).toEqual([...order.PAUSE_ROLES]);
    expect([...PHONE_LOOKUP_RESULTS]).toEqual([...order.PHONE_LOOKUP_RESULTS]);
    expect(MENU_MAX_CENTS).toBe(MAX_CENTS);
    expect(ETA_MAX_MINUTES).toBe(order.MAX_ETA_MINUTES);
    expect(NEIGHBORHOOD_NAME_MAX).toBe(order.NEIGHBORHOOD_NAME_MAX);
    expect(ORDER_NOTE_MAX).toBe(order.ORDER_NOTE_MAX);
    expect(ORDER_CUSTOMER_NAME_MAX).toBe(order.CUSTOMER_NAME_MAX);
    expect(ORDER_STREET_MAX).toBe(order.STREET_MAX);
    expect(ORDER_ADDRESS_NUMBER_MAX).toBe(order.ADDRESS_NUMBER_MAX);
    expect(ORDER_ADDRESS_COMPLEMENT_MAX).toBe(order.ADDRESS_COMPLEMENT_MAX);
    expect(ORDER_ADDRESS_REFERENCE_MAX).toBe(order.ADDRESS_REFERENCE_MAX);
    expect(ORDER_LINE_QUANTITY_MAX).toBe(MAX_LINE_QUANTITY);
    expect(STORE_OPERATION_AUDIT).toEqual(order.STORE_OPERATION_AUDIT_ACTIONS);
  });

  it("máquina de estados do @foode/db = a de @foode/shared/order", () => {
    for (const fulfillment of order.FULFILLMENTS) {
      for (const from of order.ORDER_STATUSES) {
        expect([...ORDER_TRANSITIONS[fulfillment][from]]).toEqual([
          ...order.allowedTransitions(fulfillment, from),
        ]);
      }
    }
  });
});

const STORE_ID = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
const ORDER_ID = "0b6f4d2e-3c1a-4e5b-9a8c-7d6e5f4a3b2c";
const caller = { cookie: "sessao=1", ip: "10.0.0.1" };

type Writes = string[];

function fakeService(who: "anon" | "ops" | "owner" | "operator", writes: Writes = []) {
  const session: AuthSession = {
    userId: "u1",
    email: "u1@foode.test",
    name: "U1",
    sessionId: "s1",
    expiresAt: "2030-01-01T00:00:00.000Z",
    activeStoreId: who === "owner" || who === "operator" ? STORE_ID : null,
  };
  const role = who === "owner" || who === "operator" ? who : null;
  const auth = {
    getSession: async () => (who === "anon" ? null : session),
  } as unknown as FoodeAuth;
  const transitioned = { status: "preparing", fulfillment: "pickup", printOnAccept: true };
  const write =
    <T>(name: string, value: T) =>
    async () => {
      writes.push(name);
      return value;
    };
  const db = {
    access: {
      storesOfUser: async () =>
        role ? [{ id: STORE_ID, slug: "loja-a", name: "Loja A", status: "active", role }] : [],
      opsContext: async () => (who === "ops" ? { userId: "u1" } : null),
      storeContext: async () => (role ? { storeId: STORE_ID, userId: "u1", role } : null),
    },
    store: () => ({
      orders: () => ({
        list: async () => ({ orders: [], closedToday: { completed: 0, cancelled: 0 } }),
        get: async () => null,
        advance: write("advance", { ok: true, data: transitioned }),
        cancel: write("cancel", {
          ok: true,
          data: { ...transitioned, status: "cancelled", printOnAccept: false },
        }),
      }),
      operation: () => ({
        get: async () => ({
          pause: { paused: false },
          hours: [],
          pickupEnabled: false,
          deliveryMode: null,
          fixedFeeCents: null,
          neighborhoods: [],
          deliveryMinimumOrderCents: null,
          deliveryEta: null,
          pickupEta: null,
          cardBrands: { debit: ["visa", "desconhecida"], credit: [] },
          printOnAccept: false,
        }),
        setPause: write("setPause", { paused: false }),
        setHours: write("setHours", undefined),
        setFulfillment: write("setFulfillment", { ok: true, data: null }),
        setCardBrands: write("setCardBrands", undefined),
        setPrintOnAccept: write("setPrintOnAccept", undefined),
      }),
    }),
  } as unknown as FoodeDb;
  return createOrderService({ db, auth, orderTokenSecret: "segredo-de-teste-com-mais-de-16" });
}

const FORBIDDEN = { ok: false, error: "forbidden" };
const OK_NULL = { ok: true, data: null };

describe("RPCs de Pedido e configuração (contrato)", () => {
  it("política: Pedidos e Pausa para Dono e Operador; configuração só Dono", () => {
    expect(rolesWith("orders.view")).toEqual(["owner", "operator"]);
    expect(rolesWith("orders.update_status")).toEqual(["owner", "operator"]);
    expect(rolesWith("orders.cancel")).toEqual(["owner", "operator"]);
    expect(rolesWith("store.pause")).toEqual(["owner", "operator"]);
    expect(rolesWith("store.settings")).toEqual(["owner"]);
  });

  it("entrada inválida = invalid_input antes de tocar a sessão", async () => {
    const service = fakeService("anon");
    await expect(
      service.ordersTransition(caller, { orderId: ORDER_ID, from: "received", to: "cancelled" }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      service.storeSetHours(caller, {
        periods: [{ weekday: 1, opensAt: "22:00", closesAt: "02:00" }],
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      service.storeSetFulfillment(caller, {
        pickupEnabled: false,
        deliveryMode: null,
        fixedFeeCents: null,
        neighborhoods: [],
        deliveryMinimumOrderCents: null,
        deliveryEta: { minMinutes: 50, maxMinutes: 30 },
        pickupEta: null,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(service.ordersList(caller)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it("Operador: fila, transição, cancelamento e Pausa; configuração = forbidden sem escrita", async () => {
    const writes: Writes = [];
    const service = fakeService("operator", writes);
    await expect(service.ordersList(caller, { filter: "delivery" })).resolves.toMatchObject({
      ok: true,
      data: { orders: [], closedToday: { completed: 0, cancelled: 0 } },
    });
    await expect(service.ordersGet(caller, { orderId: ORDER_ID })).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    await expect(
      service.ordersTransition(caller, { orderId: ORDER_ID, from: "received", to: "preparing" }),
    ).resolves.toEqual({
      ok: true,
      data: { status: "preparing", next: ["ready_for_pickup"], print: true },
    });
    await expect(
      service.ordersCancel(caller, { orderId: ORDER_ID, from: "received" }),
    ).resolves.toEqual({ ok: true, data: { status: "cancelled", next: [], print: false } });
    await expect(service.storeSetPause(caller, { paused: true })).resolves.toEqual({
      ok: true,
      data: { paused: false },
    });
    await expect(service.storeOperationGet(caller)).resolves.toMatchObject({
      ok: true,
      data: { cardBrands: { debit: ["visa"], credit: [] } },
    });
    expect(writes).toEqual(["advance", "cancel", "setPause"]);

    await expect(
      service.storeSetHours(caller, {
        periods: [{ weekday: 1, opensAt: "18:00", closesAt: "23:00" }],
      }),
    ).resolves.toEqual(FORBIDDEN);
    await expect(
      service.storeSetCardBrands(caller, { debit: ["visa"], credit: [] }),
    ).resolves.toEqual(FORBIDDEN);
    await expect(service.storeSetPrintOnAccept(caller, { printOnAccept: true })).resolves.toEqual(
      FORBIDDEN,
    );
    await expect(
      service.storeSetFulfillment(caller, {
        pickupEnabled: true,
        deliveryMode: "fixed",
        fixedFeeCents: 500,
        neighborhoods: [],
        deliveryMinimumOrderCents: null,
        deliveryEta: null,
        pickupEta: null,
      }),
    ).resolves.toEqual(FORBIDDEN);
    expect(writes).toEqual(["advance", "cancel", "setPause"]);
  });

  it("Dono configura tudo", async () => {
    const writes: Writes = [];
    const service = fakeService("owner", writes);
    await expect(service.storeSetPrintOnAccept(caller, { printOnAccept: true })).resolves.toEqual(
      OK_NULL,
    );
    await expect(
      service.storeSetHours(caller, {
        periods: [{ weekday: 1, opensAt: "18:00", closesAt: "23:00" }],
      }),
    ).resolves.toEqual(OK_NULL);
    await expect(
      service.storeSetFulfillment(caller, {
        pickupEnabled: true,
        deliveryMode: "neighborhood",
        fixedFeeCents: null,
        neighborhoods: [{ name: "Centro", feeCents: 500, active: true }],
        deliveryMinimumOrderCents: 3000,
        deliveryEta: { minMinutes: 30, maxMinutes: 45 },
        pickupEta: null,
      }),
    ).resolves.toEqual(OK_NULL);
    expect(writes).toEqual(["setPrintOnAccept", "setHours", "setFulfillment"]);
  });

  it("Ops não opera Pedidos nem Pausa", async () => {
    const writes: Writes = [];
    const service = fakeService("ops", writes);
    await expect(service.ordersList(caller)).resolves.toEqual(FORBIDDEN);
    await expect(service.storeSetPause(caller, { paused: true })).resolves.toEqual(FORBIDDEN);
    expect(writes).toEqual([]);
  });
});

describe("rotas públicas do Storefront (contrato)", () => {
  const env = { DB: {} as D1Database } as Env;
  const app = createApp();

  it.each([
    "/storefront/lojas/loja-a/checkout/cotacao",
    "/storefront/lojas/loja-a/pedidos",
    "/storefront/lojas/loja-a/clientes/busca",
    "/storefront/lojas/loja-a/clientes/confirmar",
  ])("POST %s com corpo inválido = 400 antes do banco", async (path) => {
    const response = await app.request(
      path,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      env,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_input" });
  });

  it("token com formato inválido = 404 order_not_found sem consultar o banco", async () => {
    const response = await app.request("/storefront/lojas/loja-a/pedidos/curto", {}, env);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "order_not_found" });
  });
});
