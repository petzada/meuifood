// Contrato do Ticket 24a sem banco: limites do D1 = limites de @foode/shared/order; as RPCs de
// Pedido/configuração validam a entrada e autorizam pela política única (Operador pode Pedidos e
// Pausa, não a configuração; Ops = `forbidden`); as rotas públicas do Storefront existem (501 até
// a fatia API). Regras com D1 ficam em *.d1.test.ts (CI).
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
  PAUSE_ROLES,
  PHONE_LOOKUP_RESULTS,
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
  });
});

const STORE_ID = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
const ORDER_ID = "0b6f4d2e-3c1a-4e5b-9a8c-7d6e5f4a3b2c";
const caller = { cookie: "sessao=1", ip: "10.0.0.1" };

function fakeService(who: "anon" | "ops" | "owner" | "operator") {
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
  const db = {
    access: {
      storesOfUser: async () =>
        role ? [{ id: STORE_ID, slug: "loja-a", name: "Loja A", status: "active", role }] : [],
      opsContext: async () => (who === "ops" ? { userId: "u1" } : null),
      storeContext: async () => (role ? { storeId: STORE_ID, userId: "u1", role } : null),
    },
  } as unknown as FoodeDb;
  return createOrderService({ db, auth });
}

const NOT_IMPLEMENTED = { ok: false, error: "not_implemented" };
const FORBIDDEN = { ok: false, error: "forbidden" };

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
    await expect(service.ordersList(caller)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it("Operador: fila, transição, cancelamento e Pausa passam o guard; configuração = forbidden", async () => {
    const service = fakeService("operator");
    await expect(service.ordersList(caller, { filter: "delivery" })).resolves.toEqual(
      NOT_IMPLEMENTED,
    );
    await expect(service.ordersGet(caller, { orderId: ORDER_ID })).resolves.toEqual(
      NOT_IMPLEMENTED,
    );
    await expect(
      service.ordersTransition(caller, { orderId: ORDER_ID, from: "received", to: "preparing" }),
    ).resolves.toEqual(NOT_IMPLEMENTED);
    await expect(
      service.ordersCancel(caller, { orderId: ORDER_ID, from: "received" }),
    ).resolves.toEqual(NOT_IMPLEMENTED);
    await expect(service.storeSetPause(caller, { paused: true })).resolves.toEqual(NOT_IMPLEMENTED);
    await expect(service.storeOperationGet(caller)).resolves.toEqual(NOT_IMPLEMENTED);
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
  });

  it("Dono passa em tudo (corpo ainda not_implemented)", async () => {
    const service = fakeService("owner");
    await expect(service.storeSetPrintOnAccept(caller, { printOnAccept: true })).resolves.toEqual(
      NOT_IMPLEMENTED,
    );
    await expect(service.storeSetPause(caller, { paused: false })).resolves.toEqual(
      NOT_IMPLEMENTED,
    );
  });

  it("Ops não opera Pedidos nem Pausa", async () => {
    const service = fakeService("ops");
    await expect(service.ordersList(caller)).resolves.toEqual(FORBIDDEN);
    await expect(service.storeSetPause(caller, { paused: true })).resolves.toEqual(FORBIDDEN);
  });
});

describe("rotas públicas do Storefront (contrato)", () => {
  const env = { DB: {} as D1Database } as Env;
  const app = createApp();

  it.each([
    ["GET", "/storefront/lojas/loja-a/estado"],
    ["POST", "/storefront/lojas/loja-a/checkout/cotacao"],
    ["POST", "/storefront/lojas/loja-a/pedidos"],
    ["GET", "/storefront/lojas/loja-a/pedidos/abcdefghijklmnopqrstuvwxyz012345"],
    ["POST", "/storefront/lojas/loja-a/clientes/busca"],
    ["POST", "/storefront/lojas/loja-a/clientes/confirmar"],
  ])("%s %s existe (501 até a fatia API)", async (method, path) => {
    const response = await app.request(path, { method }, env);
    expect(response.status).toBe(501);
  });
});
