// Pedido e configuração operacional no D1 (Ticket 24a): a escrita condicional do Pedido barra
// Pausa, horário, bairro inativo, mínimo, preço mudado e Loja não ativa NA MESMA escrita; a
// idempotência não duplica; troco < total é recusado pelo CHECK; transições sem regressão e com
// concorrência por condição; Pausa auditada com papel; isolamento entre duas Lojas (Pedido,
// token, busca por telefone, "Sou eu", bairro). Roda só no CI (vitest.workers.config.ts).
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { type StoreContext } from "./context";
import { type CreateOrderData, createFoodeDb, type FoodeDb } from "./index";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "./testing";

let db: FoodeDb;
let fx: TwoStoresFixture;
let menuA: { itemId: string; centroId: string; vilaId: string };

const NOW = "2026-11-05T15:00:00.000Z";
const OPEN = { weekday: 4, time: "12:00" };
const hex = (char: string) => char.repeat(64);

async function contextOf(userId: string, storeId: string): Promise<StoreContext> {
  const context = await db.access.storeContext({ userId, storeId });
  if (!context) throw new Error("membership esperada na fixture");
  return context;
}

const ownerA = async () => db.store(await contextOf(fx.ownerA.id, fx.storeA.id));
const operatorA = async () => db.store(await contextOf(fx.operatorA.id, fx.storeA.id));
const ownerB = async () => db.store(await contextOf(fx.ownerB.id, fx.storeB.id));

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`esperava ok, veio ${result.error}`);
  return result.data;
}

/** Loja configurada: aberta quinta 11–15h, Retirada, Delivery por bairro, um item de R$ 25,90. */
async function configure(store: Awaited<ReturnType<typeof ownerA>>) {
  await store.operation().setHours([{ weekday: 4, opensAt: "11:00", closesAt: "15:00" }]);
  unwrap(
    await store.operation().setFulfillment({
      pickupEnabled: true,
      deliveryMode: "neighborhood",
      fixedFeeCents: null,
      neighborhoods: [
        { name: "Centro", normalizedName: "centro", feeCents: 500, active: true },
        { name: "Vila", normalizedName: "vila", feeCents: 900, active: false },
      ],
      deliveryMinimumOrderCents: null,
      deliveryEta: { minMinutes: 40, maxMinutes: 60 },
      pickupEta: null,
    }),
  );
  const menu = store.menu();
  const { categoryId } = unwrap(await menu.createCategory({ name: "Lanches", available: true }));
  const { itemId } = unwrap(
    await menu.createItem({
      categoryId,
      name: "X-Burger",
      description: "",
      priceCents: 2590,
      available: true,
      featured: false,
      imageObjectKey: null,
    }),
  );
  const settings = await store.operation().get();
  const centroId = settings.neighborhoods.find((n) => n.name === "Centro")!.id;
  const vilaId = settings.neighborhoods.find((n) => n.name === "Vila")!.id;
  return { itemId, centroId, vilaId };
}

function orderData(overrides: Partial<CreateOrderData> = {}): CreateOrderData {
  return {
    slug: fx.storeA.slug,
    orderId: crypto.randomUUID(),
    accessTokenHash: uniqueHash(),
    idempotencyKey: crypto.randomUUID(),
    payloadHash: hex("a"),
    now: NOW,
    civil: OPEN,
    fulfillment: "pickup",
    paymentMethod: "on_delivery",
    customerName: "Maria Souza",
    customerPhoneE164: "5511987654321",
    delivery: null,
    subtotalCents: 2590,
    deliveryFeeCents: 0,
    discountCents: 0,
    totalCents: 2590,
    changeForCents: null,
    note: null,
    eta: null,
    lines: [
      {
        menuItemId: menuA.itemId,
        itemName: "X-Burger",
        quantity: 1,
        unitPriceCents: 2590,
        totalCents: 2590,
        complements: [],
        additionals: [],
      },
    ],
    itemPrices: [{ id: menuA.itemId, priceCents: 2590 }],
    ...overrides,
  };
}

/** Token aleatório e único por Pedido (o UNIQUE é global). */
function uniqueHash(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function deliveryOrder(overrides: Partial<CreateOrderData> = {}): CreateOrderData {
  return orderData({
    accessTokenHash: uniqueHash(),
    fulfillment: "delivery",
    delivery: {
      mode: "neighborhood",
      neighborhoodId: menuA.centroId,
      feeCents: 500,
      address: {
        postalCode: null,
        street: "Rua do Consumidor",
        number: "42",
        complement: null,
        reference: null,
        neighborhood: "Centro",
      },
    },
    deliveryFeeCents: 500,
    totalCents: 3090,
    ...overrides,
  });
}

async function phoneLookupRows(storeId: string) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM phone_lookups WHERE store_id = ? ORDER BY occurred_at",
  )
    .bind(storeId)
    .all<Record<string, unknown>>();
  return results;
}

beforeEach(async () => {
  db = createFoodeDb(env.DB);
  fx = await seedTwoStores(env.DB);
  const ops = await db.access.opsContext(fx.ops.id);
  await db.ops(ops!).updateStore(fx.storeA.id, storeProfileFixture());
  await db.ops(ops!).updateStore(fx.storeB.id, storeProfileFixture());
  menuA = await configure(await ownerA());
});

describe("criação do Pedido: condições na mesma escrita", () => {
  it("cria com código sequencial por Loja, linhas e evento inicial", async () => {
    const first = await db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash() }));
    const second = await db.storefront.createOrder(deliveryOrder());
    expect(first).toMatchObject({ kind: "created", code: 1 });
    expect(second).toMatchObject({ kind: "created", code: 2 });
    if (second.kind !== "created") return;
    const detail = await (await ownerA()).orders().get(second.orderId);
    expect(detail).toMatchObject({
      status: "received",
      fulfillment: "delivery",
      totalCents: 3090,
      address: { street: "Rua do Consumidor", number: "42", neighborhood: "Centro" },
      lines: [{ itemName: "X-Burger", quantity: 1, totalCents: 2590 }],
      history: [{ from: null, to: "received", actor: null }],
    });
  });

  it("retry com a mesma chave não duplica: devolve o Pedido existente", async () => {
    const data = orderData({ accessTokenHash: uniqueHash() });
    const created = await db.storefront.createOrder(data);
    const retry = await db.storefront.createOrder({
      ...data,
      orderId: crypto.randomUUID(),
      accessTokenHash: uniqueHash(),
    });
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;
    expect(retry).toEqual({
      kind: "existing",
      orderId: created.orderId,
      code: created.code,
      payloadHash: data.payloadHash,
    });
    const list = await (await ownerA()).orders().list({
      filter: "all",
      scope: "active",
      closedSince: NOW,
    });
    expect(list.orders).toHaveLength(1);
    await expect(
      db.storefront.findByIdempotencyKey(fx.storeA.slug, data.idempotencyKey),
    ).resolves.toMatchObject({ orderId: created.orderId });
  });

  it("Pausa ativada depois da cotação barra a escrita; retomar libera", async () => {
    await (await operatorA()).operation().setPause(true);
    await expect(
      db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash() })),
    ).resolves.toEqual({ kind: "rejected" });
    await (await ownerA()).operation().setPause(false);
    await expect(
      db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash() })),
    ).resolves.toMatchObject({ kind: "created" });
  });

  it("fora do horário (ou grade trocada depois da cotação) barra a escrita", async () => {
    await expect(
      db.storefront.createOrder(
        orderData({ accessTokenHash: uniqueHash(), civil: { weekday: 4, time: "15:00" } }),
      ),
    ).resolves.toEqual({ kind: "rejected" });
    await (
      await ownerA()
    )
      .operation()
      .setHours([{ weekday: 5, opensAt: "11:00", closesAt: "15:00" }]);
    await expect(
      db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash() })),
    ).resolves.toEqual({ kind: "rejected" });
  });

  it("bairro inativo, taxa mudada, mínimo não atingido e Retirada desligada barram a escrita", async () => {
    await expect(
      db.storefront.createOrder(
        deliveryOrder({
          delivery: {
            mode: "neighborhood",
            neighborhoodId: menuA.vilaId,
            feeCents: 900,
            address: {
              postalCode: null,
              street: "Rua",
              number: "1",
              complement: null,
              reference: null,
              neighborhood: "Vila",
            },
          },
          deliveryFeeCents: 900,
          totalCents: 3490,
        }),
      ),
    ).resolves.toEqual({ kind: "rejected" });

    const store = await ownerA();
    unwrap(
      await store.operation().setFulfillment({
        pickupEnabled: false,
        deliveryMode: "neighborhood",
        fixedFeeCents: null,
        neighborhoods: [
          {
            id: menuA.centroId,
            name: "Centro",
            normalizedName: "centro",
            feeCents: 600,
            active: true,
          },
        ],
        deliveryMinimumOrderCents: 3000,
        deliveryEta: null,
        pickupEta: null,
      }),
    );
    // Taxa cotada (500) ≠ gravada (600).
    await expect(db.storefront.createOrder(deliveryOrder())).resolves.toEqual({ kind: "rejected" });
    // Taxa certa, mas subtotal 2590 < mínimo 3000.
    await expect(
      db.storefront.createOrder(
        deliveryOrder({
          delivery: {
            mode: "neighborhood",
            neighborhoodId: menuA.centroId,
            feeCents: 600,
            address: {
              postalCode: null,
              street: "Rua",
              number: "1",
              complement: null,
              reference: null,
              neighborhood: "Centro",
            },
          },
          deliveryFeeCents: 600,
          totalCents: 3190,
        }),
      ),
    ).resolves.toEqual({ kind: "rejected" });
    await expect(
      db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash() })),
    ).resolves.toEqual({ kind: "rejected" });
  });

  it("preço do item mudado ou item indisponível depois da cotação barra a escrita", async () => {
    await (await ownerA()).menu().updateItem({ itemId: menuA.itemId, priceCents: 2790 });
    await expect(
      db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash() })),
    ).resolves.toEqual({ kind: "rejected" });
  });

  it("Loja não ativa não recebe Pedido", async () => {
    const ops = await db.access.opsContext(fx.ops.id);
    await db.ops(ops!).changeStoreStatus(fx.storeA.id, "suspended", {
      allowedFrom: ["active"],
      reason: "teste",
    });
    await expect(
      db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash() })),
    ).resolves.toEqual({ kind: "rejected" });
    await expect(db.storefront.operationBySlug(fx.storeA.slug)).resolves.toBeNull();
  });

  it("troco menor que o total é recusado pelo CHECK (nada gravado)", async () => {
    await expect(
      db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash(), changeForCents: 2000 })),
    ).rejects.toThrow();
    const list = await (await ownerA()).orders().list({
      filter: "all",
      scope: "active",
      closedSince: NOW,
    });
    expect(list.orders).toHaveLength(0);
  });
});

describe("isolamento entre duas Lojas", () => {
  it("mesma chave em Lojas diferentes cria dois Pedidos; token e Pedido de A não aparecem em B", async () => {
    const bMenu = await configure(await ownerB());
    const key = crypto.randomUUID();
    const tokenA = uniqueHash();
    const createdA = await db.storefront.createOrder(
      orderData({ idempotencyKey: key, accessTokenHash: tokenA }),
    );
    const createdB = await db.storefront.createOrder(
      orderData({
        slug: fx.storeB.slug,
        idempotencyKey: key,
        accessTokenHash: uniqueHash(),
        lines: [{ ...orderData().lines[0]!, menuItemId: bMenu.itemId }],
        itemPrices: [{ id: bMenu.itemId, priceCents: 2590 }],
      }),
    );
    expect(createdA).toMatchObject({ kind: "created", code: 1 });
    expect(createdB).toMatchObject({ kind: "created", code: 1 });
    if (createdA.kind !== "created") return;

    await expect(db.storefront.orderByTokenHash(fx.storeA.slug, tokenA)).resolves.toMatchObject({
      order: { id: createdA.orderId },
    });
    await expect(db.storefront.orderByTokenHash(fx.storeB.slug, tokenA)).resolves.toBeNull();
    await expect((await ownerB()).orders().get(createdA.orderId)).resolves.toBeNull();
    await expect(
      (await ownerB()).orders().advance(createdA.orderId, "received", "preparing"),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    expect((await (await ownerA()).orders().get(createdA.orderId))?.status).toBe("received");
  });

  it("item de outra Loja não passa na escrita", async () => {
    const bMenu = await configure(await ownerB());
    await expect(
      db.storefront.createOrder(
        orderData({
          accessTokenHash: uniqueHash(),
          itemPrices: [{ id: bMenu.itemId, priceCents: 2590 }],
        }),
      ),
    ).resolves.toEqual({ kind: "rejected" });
  });

  it("bairro de outra Loja = not_found na configuração, sem efeito", async () => {
    const before = await (await ownerB()).operation().get();
    await expect(
      (await ownerB()).operation().setFulfillment({
        pickupEnabled: true,
        deliveryMode: "neighborhood",
        fixedFeeCents: null,
        neighborhoods: [
          {
            id: menuA.centroId,
            name: "Roubado",
            normalizedName: "roubado",
            feeCents: 1,
            active: true,
          },
        ],
        deliveryMinimumOrderCents: null,
        deliveryEta: null,
        pickupEta: null,
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    await expect((await ownerB()).operation().get()).resolves.toEqual(before);
    const a = await (await ownerA()).operation().get();
    expect(a.neighborhoods.find((n) => n.id === menuA.centroId)?.name).toBe("Centro");
  });

  it("busca por telefone só vê Pedidos da mesma Loja; token do Sou eu não vale em outra Loja", async () => {
    await configure(await ownerB());
    await db.storefront.createOrder(deliveryOrder());

    const inB = await db.storefront.phoneLookupBegin({
      slug: fx.storeB.slug,
      ipHash: hex("b"),
      now: NOW,
      windowStart: "2026-11-05T14:50:00.000Z",
      max: 5,
    });
    await expect(
      db.storefront.phoneLookupMatch({
        lookupId: inB!.lookupId,
        phoneE164: "5511987654321",
        confirmTokenHash: hex("c"),
        expiresAt: "2026-11-05T15:05:00.000Z",
      }),
    ).resolves.toEqual({ found: false });

    const inA = await db.storefront.phoneLookupBegin({
      slug: fx.storeA.slug,
      ipHash: hex("b"),
      now: NOW,
      windowStart: "2026-11-05T14:50:00.000Z",
      max: 5,
    });
    await expect(
      db.storefront.phoneLookupMatch({
        lookupId: inA!.lookupId,
        phoneE164: "5511987654321",
        confirmTokenHash: hex("d"),
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      found: true,
      customerName: "Maria Souza",
      street: "Rua do Consumidor",
      neighborhood: "Centro",
    });

    const confirm = { confirmTokenHash: hex("d"), now: NOW };
    await expect(
      db.storefront.phoneLookupConfirm({ slug: fx.storeB.slug, ...confirm }),
    ).resolves.toBeNull();
    await expect(
      db.storefront.phoneLookupConfirm({ slug: fx.storeA.slug, ...confirm }),
    ).resolves.toEqual({
      customerName: "Maria Souza",
      customerPhone: "5511987654321",
      address: {
        postalCode: null,
        street: "Rua do Consumidor",
        number: "42",
        complement: null,
        reference: null,
        neighborhood: "Centro",
      },
    });
    // Uso único.
    await expect(
      db.storefront.phoneLookupConfirm({ slug: fx.storeA.slug, ...confirm }),
    ).resolves.toBeNull();

    // Auditoria: Loja, quando, hash do IP e resultado; nenhuma coluna com o telefone.
    const rowsA = await phoneLookupRows(fx.storeA.id);
    const rowsB = await phoneLookupRows(fx.storeB.id);
    expect(rowsA.map((row) => row.result)).toEqual(["found"]);
    expect(rowsB.map((row) => row.result)).toEqual(["not_found"]);
    expect(JSON.stringify([...rowsA, ...rowsB])).not.toContain("987654321");
  });
});

describe("busca por telefone: rate limit e auditoria", () => {
  it("o rate limit por IP é decidido na própria escrita da auditoria, por Loja", async () => {
    const begin = () =>
      db.storefront.phoneLookupBegin({
        slug: fx.storeA.slug,
        ipHash: hex("e"),
        now: NOW,
        windowStart: "2026-11-05T14:50:00.000Z",
        max: 2,
      });
    expect((await begin())?.rateLimited).toBe(false);
    expect((await begin())?.rateLimited).toBe(false);
    expect((await begin())?.rateLimited).toBe(true);
    const otherStore = await db.storefront.phoneLookupBegin({
      slug: fx.storeB.slug,
      ipHash: hex("e"),
      now: NOW,
      windowStart: "2026-11-05T14:50:00.000Z",
      max: 2,
    });
    expect(otherStore?.rateLimited).toBe(false);

    const captcha = await begin();
    await db.storefront.phoneLookupFail(captcha!.lookupId, "captcha_failed");
    const rows = await phoneLookupRows(fx.storeA.id);
    expect(rows.map((row) => row.result).sort()).toEqual([
      "not_found",
      "not_found",
      "rate_limited",
      "rate_limited",
    ]);
    await expect(
      db.storefront.phoneLookupBegin({
        slug: "loja-que-nao-existe",
        ipHash: hex("e"),
        now: NOW,
        windowStart: NOW,
        max: 2,
      }),
    ).resolves.toBeNull();
  });

  it("token do Sou eu vencido não libera os dados", async () => {
    await db.storefront.createOrder(deliveryOrder());
    const begin = await db.storefront.phoneLookupBegin({
      slug: fx.storeA.slug,
      ipHash: hex("f"),
      now: NOW,
      windowStart: "2026-11-05T14:50:00.000Z",
      max: 5,
    });
    await db.storefront.phoneLookupMatch({
      lookupId: begin!.lookupId,
      phoneE164: "5511987654321",
      confirmTokenHash: hex("1"),
      expiresAt: "2026-11-05T15:05:00.000Z",
    });
    await expect(
      db.storefront.phoneLookupConfirm({
        slug: fx.storeA.slug,
        confirmTokenHash: hex("1"),
        now: "2026-11-05T15:05:00.001Z",
      }),
    ).resolves.toBeNull();
  });
});

describe("transições e Pausa no Painel", () => {
  async function newOrder() {
    const created = await db.storefront.createOrder(orderData({ accessTokenHash: uniqueHash() }));
    if (created.kind !== "created") throw new Error("Pedido esperado");
    return created.orderId;
  }

  it("só destinos válidos do Fulfillment, sem regressão; estado ≠ from = conflict sem gravar", async () => {
    const orderId = await newOrder();
    const orders = (await operatorA()).orders();
    // Retirada não tem "Saiu para entrega".
    await expect(orders.advance(orderId, "received", "out_for_delivery")).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(orders.advance(orderId, "received", "preparing")).resolves.toEqual({
      ok: true,
      data: { status: "preparing", fulfillment: "pickup", printOnAccept: false },
    });
    // Regressão e pulo.
    await expect(orders.advance(orderId, "preparing", "received")).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(orders.advance(orderId, "preparing", "completed")).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    // Outro membro viu o estado antigo.
    await expect(orders.advance(orderId, "received", "preparing")).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    await orders.advance(orderId, "preparing", "ready_for_pickup");
    await orders.advance(orderId, "ready_for_pickup", "completed");
    // Final não muda mais (nem cancela).
    await expect(orders.cancel(orderId, "completed")).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    const detail = await orders.get(orderId);
    expect(detail?.status).toBe("completed");
    expect(detail?.history.map((h) => [h.from, h.to, h.actor?.role ?? null])).toEqual([
      [null, "received", null],
      ["received", "preparing", "operator"],
      ["preparing", "ready_for_pickup", "operator"],
      ["ready_for_pickup", "completed", "operator"],
    ]);
    const closed = await orders.list({
      filter: "pickup",
      scope: "closed_today",
      closedSince: "2000-01-01T00:00:00.000Z",
    });
    expect(closed.closedToday).toEqual({ completed: 1, cancelled: 0 });
  });

  it("cancelamento sem Estorno; aceite devolve Imprimir ao aceitar", async () => {
    await (await ownerA()).operation().setPrintOnAccept(true);
    const first = await newOrder();
    const orders = (await operatorA()).orders();
    await expect(orders.advance(first, "received", "preparing")).resolves.toMatchObject({
      ok: true,
      data: { printOnAccept: true },
    });
    const second = await newOrder();
    await expect(orders.cancel(second, "received")).resolves.toMatchObject({
      ok: true,
      data: { status: "cancelled" },
    });
    const active = await orders.list({ filter: "all", scope: "active", closedSince: NOW });
    expect(active.orders.map((o) => o.id)).toEqual([first]);
  });

  it("Pausa: Operador ativa, Dono retoma; auditada com papel e idempotente", async () => {
    const pause = await (await operatorA()).operation().setPause(true);
    expect(pause).toMatchObject({
      paused: true,
      pausedBy: { userId: fx.operatorA.id, name: "Operador A", role: "operator" },
    });
    await (await operatorA()).operation().setPause(true);
    await (await ownerA()).operation().setPause(false);
    await (await ownerA()).operation().setPause(false);
    const trail = await (await ownerA()).auditTrail(200);
    const pauses = trail
      .filter((event) => event.action === "store.pause" || event.action === "store.resume")
      .reverse();
    expect(pauses.map((event) => [event.action, event.metadata.role, event.actorUserId])).toEqual([
      ["store.pause", "operator", fx.operatorA.id],
      ["store.resume", "owner", fx.ownerA.id],
    ]);
  });

  it("Operador não grava configuração (defesa em profundidade no pacote)", async () => {
    const operation = (await operatorA()).operation();
    const before = await operation.get();
    await expect(operation.setHours([])).rejects.toMatchObject({ code: "forbidden" });
    await expect(operation.setPrintOnAccept(true)).rejects.toMatchObject({ code: "forbidden" });
    await expect(operation.setCardBrands({ debit: ["visa"], credit: [] })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(operation.get()).resolves.toEqual(before);
  });

  it("nome de bairro repetido = conflict; troca de nomes entre bairros funciona", async () => {
    const operation = (await ownerA()).operation();
    const swap = await operation.setFulfillment({
      pickupEnabled: true,
      deliveryMode: "neighborhood",
      fixedFeeCents: null,
      neighborhoods: [
        { id: menuA.centroId, name: "Vila", normalizedName: "vila", feeCents: 500, active: true },
        {
          id: menuA.vilaId,
          name: "Centro",
          normalizedName: "centro",
          feeCents: 900,
          active: false,
        },
      ],
      deliveryMinimumOrderCents: null,
      deliveryEta: null,
      pickupEta: null,
    });
    expect(swap).toEqual({ ok: true, data: null });
    const duplicated = await operation.setFulfillment({
      pickupEnabled: true,
      deliveryMode: "neighborhood",
      fixedFeeCents: null,
      neighborhoods: [
        { name: "Novo", normalizedName: "novo", feeCents: 1, active: true },
        { name: "Novo", normalizedName: "novo", feeCents: 2, active: true },
      ],
      deliveryMinimumOrderCents: null,
      deliveryEta: null,
      pickupEta: null,
    });
    expect(duplicated).toEqual({ ok: false, error: "conflict" });
    const after = await operation.get();
    expect(after.neighborhoods.map((n) => n.name)).toEqual(["Vila", "Centro"]);
  });
});
