import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";

import { Temporal } from "@js-temporal/polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAdministrativeDatabase,
  createBusinessDatabase,
  hashOrderAccessToken,
  type BusinessDatabase,
} from "@foode/db";

import { buildApp } from "./app.js";
import { fingerprintIdempotentPayload } from "./order-idempotency.js";

function requiredSecret(source: string, name: string) {
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) throw new Error(`${name} não foi configurada para o teste remoto.`);

  const value = line.slice(line.indexOf("=") + 1).trim();
  const unquoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1)
      : value;
  if (!unquoted) throw new Error(`${name} está vazia.`);
  return unquoted;
}

async function productionDatabaseUrls() {
  const environmentPassword = process.env.SUPABASE_DB_PASSWORD?.trim();
  const environmentPooler = process.env.SUPABASE_POOLER_URL?.trim();
  if (Boolean(environmentPassword) !== Boolean(environmentPooler)) {
    throw new Error(
      "SUPABASE_DB_PASSWORD e SUPABASE_POOLER_URL devem ser configuradas juntas.",
    );
  }

  let password = environmentPassword;
  let pooler = environmentPooler;
  if (!password || !pooler) {
    const repositoryEnvironmentFile = new URL("../../../.env", import.meta.url);
    const linkedPoolerFile = new URL(
      "../../../supabase/.temp/pooler-url",
      import.meta.url,
    );
    if (
      !existsSync(repositoryEnvironmentFile) ||
      !existsSync(linkedPoolerFile)
    ) {
      throw new Error(
        "Configure as credenciais do Supabase de produção para a prova remota.",
      );
    }

    const [environmentFile, poolerFile] = await Promise.all([
      readFile(repositoryEnvironmentFile, "utf8"),
      readFile(linkedPoolerFile, "utf8"),
    ]);
    password = requiredSecret(environmentFile, "SUPABASE_DB_PASSWORD");
    pooler = poolerFile.trim();
  }

  const url = new URL(pooler);
  url.password = password;
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  const businessUrlValue = process.env.BUSINESS_DATABASE_URL?.trim();
  if (!businessUrlValue) {
    throw new Error(
      "BUSINESS_DATABASE_URL é obrigatória para provar Pedidos com RLS real.",
    );
  }
  const businessUrl = new URL(businessUrlValue);
  if (
    businessUrl.hostname !== url.hostname ||
    !businessUrl.username.startsWith("foode_business")
  ) {
    throw new Error(
      "BUSINESS_DATABASE_URL deve usar foode_business no pooler do Foode Delivery.",
    );
  }
  businessUrl.searchParams.set("sslmode", "require");
  businessUrl.searchParams.set("uselibpqcompat", "true");
  return { administrativeUrl: url.toString(), businessUrl: businessUrl.toString() };
}

function syntheticTaxId() {
  return [...randomBytes(14)].map((byte) => String(byte % 10)).join("");
}

describe("Pedido Guest Retirada on_delivery", { timeout: 60_000 }, () => {
  const runId = process.env.CI_RUN_ID ?? randomBytes(8).toString("hex");
  const createdStoreIds: string[] = [];
  let administrativeDatabase: ReturnType<typeof createAdministrativeDatabase>;
  let businessDatabase: BusinessDatabase;
  let operatorUserId: string;
  let ownerAUserId: string;
  let ownerBUserId: string;
  let storeAId: string;
  let storeASlug: string;
  let itemId: string;
  let itemBId: string;
  let groupId: string;
  let optionId: string;
  let additionalId: string;
  let fixedNow: Temporal.Instant;

  beforeAll(async () => {
    const { administrativeUrl, businessUrl } = await productionDatabaseUrls();
    administrativeDatabase = createAdministrativeDatabase(administrativeUrl);
    businessDatabase = createBusinessDatabase(businessUrl);
    await businessDatabase.assertRestrictedRuntime();

    storeASlug = `fixture-order-a-${runId}`;
    const storeA = await administrativeDatabase.store.create({
      data: {
        billingMode: "baas",
        contactPhoneE164: "5511988887777",
        name: `Fixture Order A ${runId}`,
        pickupEnabled: true,
        slug: storeASlug,
        taxId: syntheticTaxId(),
      },
    });
    createdStoreIds.push(storeA.id);
    storeAId = storeA.id;
    ownerAUserId = randomUUID();
    operatorUserId = randomUUID();
    await administrativeDatabase.storeMember.createMany({
      data: [
        { role: "owner", storeId: storeAId, userId: ownerAUserId },
        { role: "operator", storeId: storeAId, userId: operatorUserId },
      ],
    });

    const weekday = Temporal.Now.zonedDateTimeISO("America/Sao_Paulo").dayOfWeek;
    await administrativeDatabase.storeOperatingPeriod.create({
      data: {
        closesAt: "23:59",
        opensAt: "00:00",
        storeId: storeAId,
        weekday,
      },
    });
    fixedNow = Temporal.Now.zonedDateTimeISO("America/Sao_Paulo")
      .with({ hour: 12, minute: 0, second: 0, millisecond: 0 })
      .toInstant();

    const storeB = await administrativeDatabase.store.create({
      data: {
        billingMode: "merchant_own_account",
        name: `Fixture Order B ${runId}`,
        pickupEnabled: true,
        slug: `fixture-order-b-${runId}`,
        taxId: syntheticTaxId(),
      },
    });
    createdStoreIds.push(storeB.id);
    ownerBUserId = randomUUID();
    await administrativeDatabase.storeMember.create({
      data: { role: "owner", storeId: storeB.id, userId: ownerBUserId },
    });

    const app = appForOrders();
    try {
      const category = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { name: "Lanches" },
        url: "/menu/categories",
      });
      expect(category.statusCode).toBe(201);
      const categoryId = (category.json() as { category: { id: string } })
        .category.id;

      const item = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          available: true,
          categoryId,
          name: "Burger",
          priceCents: 2500,
        },
        url: "/menu/items",
      });
      expect(item.statusCode).toBe(201);
      itemId = (item.json() as { item: { id: string } }).item.id;

      const group = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          itemId,
          name: "Ponto",
          options: [{ name: "Ao ponto" }],
          required: true,
        },
        url: "/menu/complement-groups",
      });
      expect(group.statusCode).toBe(201);
      const groupBody = group.json() as {
        group: { id: string; options: Array<{ id: string }> };
      };
      groupId = groupBody.group.id;
      optionId = groupBody.group.options[0]!.id;

      const additional = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: {
          available: true,
          itemId,
          name: "Bacon",
          priceCents: 300,
        },
        url: "/menu/additionals",
      });
      expect(additional.statusCode).toBe(201);
      additionalId = (additional.json() as { additional: { id: string } })
        .additional.id;

      const categoryB = await app.inject({
        headers: { authorization: "Bearer owner-b" },
        method: "POST",
        payload: { name: "Outros" },
        url: "/menu/categories",
      });
      expect(categoryB.statusCode).toBe(201);
      const categoryBId = (categoryB.json() as { category: { id: string } })
        .category.id;
      const itemB = await app.inject({
        headers: { authorization: "Bearer owner-b" },
        method: "POST",
        payload: {
          available: true,
          categoryId: categoryBId,
          name: "Item Loja B",
          priceCents: 1500,
        },
        url: "/menu/items",
      });
      expect(itemB.statusCode).toBe(201);
      itemBId = (itemB.json() as { item: { id: string } }).item.id;
    } finally {
      await app.close();
    }
  }, 90_000);

  afterAll(async () => {
    try {
      if (administrativeDatabase && createdStoreIds.length > 0) {
        await administrativeDatabase.store.deleteMany({
          where: { id: { in: createdStoreIds } },
        });
        const residueCount = await administrativeDatabase.store.count({
          where: { id: { in: createdStoreIds } },
        });
        expect(residueCount).toBe(0);
      }
    } finally {
      await businessDatabase?.close();
      await administrativeDatabase?.$disconnect();
    }
  });

  function appForOrders(overrides: { loggerDestination?: Writable } = {}) {
    return buildApp({
      businessDatabase,
      ...(overrides.loggerDestination
        ? { loggerDestination: overrides.loggerDestination }
        : { logger: false as const }),
      now: () => fixedNow ?? Temporal.Now.instant(),
      verifyAccessToken: async (token) => {
        if (token === "owner-a") return { userId: ownerAUserId };
        if (token === "operator-a") return { userId: operatorUserId };
        if (token === "owner-b") return { userId: ownerBUserId };
        throw new Error("invalid_fixture_token");
      },
    });
  }

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      fulfillmentType: "pickup",
      guest: { name: "Ana Silva", phone: "11988887777" },
      lines: [
        {
          additionalIds: [additionalId],
          complementSelections: { [groupId]: optionId },
          itemId,
          quantity: 2,
        },
      ],
      paymentMethod: "on_delivery",
      ...overrides,
    };
  }

  it("cria Pedido Guest Retirada recalculando total e permite tracking opaco", async () => {
    const app = appForOrders();
    try {
      const created = await app.inject({
        headers: { "idempotency-key": `key-create-${runId}` },
        method: "POST",
        payload: validPayload(),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(created.statusCode, created.body).toBe(201);
      const body = created.json() as {
        order: {
          accessToken: string;
          publicCode: string;
          status: string;
          totalCents: number;
        };
      };
      expect(body.order.status).toBe("received");
      expect(body.order.totalCents).toBe(5600);
      expect(body.order.accessToken.length).toBeGreaterThanOrEqual(32);

      const stored = await administrativeDatabase.order.findFirst({
        where: { storeId: storeAId, publicCode: body.order.publicCode },
        select: { accessToken: true },
      });
      expect(stored?.accessToken).toBe(hashOrderAccessToken(body.order.accessToken));
      expect(stored?.accessToken).not.toBe(body.order.accessToken);
      expect(stored?.accessToken).toMatch(/^[a-f0-9]{64}$/u);

      const track = await app.inject({
        method: "GET",
        url: `/public/orders/${body.order.accessToken}`,
      });
      expect(track.statusCode).toBe(200);
      const trackBody = track.json() as {
        order: { accessToken?: string; publicCode: string };
        whatsappUrl: string | null;
      };
      expect(trackBody.order.publicCode).toBe(body.order.publicCode);
      expect(trackBody.order.accessToken).toBeUndefined();
      expect(trackBody.whatsappUrl).toContain("wa.me/5511988887777");
      expect(JSON.stringify(trackBody)).not.toContain(body.order.accessToken);
    } finally {
      await app.close();
    }
  });

  it("retry idempotente não duplica; payload divergente conflita", async () => {
    const app = appForOrders();
    const key = `key-idem-${runId}`;
    try {
      const first = await app.inject({
        headers: { "idempotency-key": key },
        method: "POST",
        payload: validPayload({ guest: { name: "Bia", phone: "11977776666" } }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(first.statusCode, first.body).toBe(201);
      const firstOrder = (
        first.json() as { order: { accessToken: string; publicCode: string } }
      ).order;

      const replay = await app.inject({
        headers: { "idempotency-key": key },
        method: "POST",
        payload: validPayload({ guest: { name: "Bia", phone: "11977776666" } }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(replay.statusCode).toBe(200);
      const replayOrder = (
        replay.json() as { order: { accessToken?: string; publicCode: string } }
      ).order;
      expect(replayOrder.publicCode).toBe(firstOrder.publicCode);
      expect(replayOrder.accessToken).toBeUndefined();

      const conflict = await app.inject({
        headers: { "idempotency-key": key },
        method: "POST",
        payload: validPayload({
          guest: { name: "Outra", phone: "11977776666" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(conflict.statusCode).toBe(409);
      expect((conflict.json() as { error: string }).error).toBe(
        "idempotency_key_conflict",
      );
    } finally {
      await app.close();
    }
  });

  it("idempotência concorrente: mesmo payload replay; divergente conflita sem 500", async () => {
    const app = appForOrders();
    const sameKey = `key-conc-same-${runId}`;
    const divergeKey = `key-conc-div-${runId}`;
    try {
      const [left, right] = await Promise.all([
        app.inject({
          headers: { "idempotency-key": sameKey },
          method: "POST",
          payload: validPayload({
            guest: { name: "Concurrent Same", phone: "11955554444" },
          }),
          url: `/public/stores/${storeASlug}/orders`,
        }),
        app.inject({
          headers: { "idempotency-key": sameKey },
          method: "POST",
          payload: validPayload({
            guest: { name: "Concurrent Same", phone: "11955554444" },
          }),
          url: `/public/stores/${storeASlug}/orders`,
        }),
      ]);
      const sameStatuses = [left.statusCode, right.statusCode].sort();
      expect(sameStatuses).toEqual([200, 201]);
      expect([left.statusCode, right.statusCode]).not.toContain(500);
      const sameCount = await administrativeDatabase.order.count({
        where: { storeId: storeAId, idempotencyKey: sameKey },
      });
      expect(sameCount).toBe(1);

      const [firstDiv, secondDiv] = await Promise.all([
        app.inject({
          headers: { "idempotency-key": divergeKey },
          method: "POST",
          payload: validPayload({
            guest: { name: "Concurrent A", phone: "11944443333" },
          }),
          url: `/public/stores/${storeASlug}/orders`,
        }),
        app.inject({
          headers: { "idempotency-key": divergeKey },
          method: "POST",
          payload: validPayload({
            guest: { name: "Concurrent B", phone: "11944443333" },
          }),
          url: `/public/stores/${storeASlug}/orders`,
        }),
      ]);
      const divergeStatuses = [firstDiv.statusCode, secondDiv.statusCode].sort();
      expect(divergeStatuses).toEqual([201, 409]);
      expect([firstDiv.statusCode, secondDiv.statusCode]).not.toContain(500);
      const divergeCount = await administrativeDatabase.order.count({
        where: { storeId: storeAId, idempotencyKey: divergeKey },
      });
      expect(divergeCount).toBe(1);
      const conflictBody = [firstDiv, secondDiv].find(
        (response) => response.statusCode === 409,
      );
      expect((conflictBody!.json() as { error: string }).error).toBe(
        "idempotency_key_conflict",
      );
    } finally {
      await app.close();
    }
  });

  it("Pausa entre precheck e persistência não cria Pedido", async () => {
    const key = `key-pause-race-${runId}`;
    const payload = validPayload({
      guest: { name: "Pause Race", phone: "11933332222" },
    });
    const payloadHash = fingerprintIdempotentPayload({
      fulfillmentType: "pickup",
      guest: { name: "Pause Race", phone: "5511933332222" },
      lines: payload.lines,
      paymentMethod: "on_delivery",
      storeSlug: storeASlug,
    });

    // Soft precheck passaria (Loja aberta).
    const before = await businessDatabase.findPublicStoreOperationBySlug(
      storeASlug,
    );
    expect(before?.paused).toBe(false);

    await administrativeDatabase.store.update({
      data: { paused: true },
      where: { id: storeAId },
    });

    const result = await businessDatabase.createGuestPickupOrder({
      guestName: "Pause Race",
      guestPhoneE164: "5511933332222",
      idempotencyKey: key,
      lines: payload.lines as never,
      nowIso: fixedNow.toString(),
      payloadHash,
      storeSlug: storeASlug,
    });
    expect(result.kind).toBe("store_paused");

    const createdCount = await administrativeDatabase.order.count({
      where: { storeId: storeAId, idempotencyKey: key },
    });
    expect(createdCount).toBe(0);

    await administrativeDatabase.store.update({
      data: { paused: false },
      where: { id: storeAId },
    });
  });

  it("rejeita Loja pausada, Retirada inativa e item real de outra Loja", async () => {
    const app = appForOrders();
    try {
      await administrativeDatabase.store.update({
        data: { paused: true },
        where: { id: storeAId },
      });
      const paused = await app.inject({
        headers: { "idempotency-key": `key-paused-${runId}` },
        method: "POST",
        payload: validPayload(),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(paused.statusCode).toBe(409);
      expect((paused.json() as { error: string }).error).toBe("store_paused");
      await administrativeDatabase.store.update({
        data: { paused: false },
        where: { id: storeAId },
      });

      await administrativeDatabase.store.update({
        data: { pickupEnabled: false },
        where: { id: storeAId },
      });
      const pickupOff = await app.inject({
        headers: { "idempotency-key": `key-pickup-off-${runId}` },
        method: "POST",
        payload: validPayload(),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(pickupOff.statusCode).toBe(409);
      expect((pickupOff.json() as { error: string }).error).toBe(
        "pickup_disabled",
      );
      await administrativeDatabase.store.update({
        data: { pickupEnabled: true },
        where: { id: storeAId },
      });

      const foreignItem = await app.inject({
        headers: { "idempotency-key": `key-cross-${runId}` },
        method: "POST",
        payload: validPayload({
          lines: [
            {
              additionalIds: [],
              complementSelections: {},
              itemId: itemBId,
              quantity: 1,
            },
          ],
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(foreignItem.statusCode).toBe(409);
      expect((foreignItem.json() as { error: string }).error).toBe(
        "item_not_found",
      );
      expect(itemBId).not.toBe(itemId);
    } finally {
      await app.close();
    }
  });

  it("Dono e Operador listam e transitam Retirada; outra Loja não vê", async () => {
    const app = appForOrders();
    try {
      const created = await app.inject({
        headers: { "idempotency-key": `key-staff-${runId}` },
        method: "POST",
        payload: validPayload({
          guest: { name: "Carlos", phone: "11966665555" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(created.statusCode, created.body).toBe(201);
      const createdToken = (
        created.json() as { order: { accessToken: string } }
      ).order.accessToken;

      const listOwner = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "GET",
        url: "/orders",
      });
      expect(listOwner.statusCode).toBe(200);
      const ownerOrders = (
        listOwner.json() as { orders: Array<{ id: string; publicCode: string }> }
      ).orders;
      expect(ownerOrders.length).toBeGreaterThan(0);
      const orderId = ownerOrders[0]!.id;

      const listOther = await app.inject({
        headers: { authorization: "Bearer owner-b" },
        method: "GET",
        url: "/orders",
      });
      expect(listOther.statusCode).toBe(200);
      expect(
        (listOther.json() as { orders: unknown[] }).orders,
      ).toHaveLength(0);

      const foreignDetail = await app.inject({
        headers: { authorization: "Bearer owner-b" },
        method: "GET",
        url: `/orders/${orderId}`,
      });
      expect(foreignDetail.statusCode).toBe(404);

      const prepare = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "POST",
        payload: { to: "preparing" },
        url: `/orders/${orderId}/transitions`,
      });
      expect(prepare.statusCode).toBe(200);
      expect(
        JSON.stringify(prepare.json()),
      ).not.toContain(createdToken);

      const invalid = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "POST",
        payload: { to: "completed" },
        url: `/orders/${orderId}/transitions`,
      });
      expect(invalid.statusCode).toBe(409);

      const ready = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { to: "ready_for_pickup" },
        url: `/orders/${orderId}/transitions`,
      });
      expect(ready.statusCode).toBe(200);

      await administrativeDatabase.menuItem.update({
        data: { name: "Burger Renomeado", priceCents: 9999 },
        where: { id: itemId },
      });
      const detail = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "GET",
        url: `/orders/${orderId}`,
      });
      expect(detail.statusCode).toBe(200);
      const detailBody = detail.json() as {
        order: {
          accessToken?: string;
          lines: Array<{ itemName: string; unitPriceCents: number }>;
          totalCents: number;
        };
      };
      expect(detailBody.order.accessToken).toBeUndefined();
      expect(detailBody.order.lines[0]?.itemName).toBe("Burger");
      expect(detailBody.order.lines[0]?.unitPriceCents).toBe(2800);
      expect(detailBody.order.totalCents).toBe(5600);
      expect(JSON.stringify(detailBody)).not.toContain(createdToken);
    } finally {
      await app.close();
    }
  });

  it("transições concorrentes não sobrescrevem estado terminal", async () => {
    const app = appForOrders();
    try {
      const created = await app.inject({
        headers: { "idempotency-key": `key-toctou-${runId}` },
        method: "POST",
        payload: validPayload({
          guest: { name: "Toctou", phone: "11922221111" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(created.statusCode, created.body).toBe(201);
      const list = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "GET",
        url: "/orders",
      });
      const orderId = (
        list.json() as { orders: Array<{ id: string; guestName: string }> }
      ).orders.find((order) => order.guestName === "Toctou")!.id;

      const [toPreparing, toCancelled] = await Promise.all([
        app.inject({
          headers: { authorization: "Bearer operator-a" },
          method: "POST",
          payload: { to: "preparing" },
          url: `/orders/${orderId}/transitions`,
        }),
        app.inject({
          headers: { authorization: "Bearer owner-a" },
          method: "POST",
          payload: { to: "cancelled" },
          url: `/orders/${orderId}/transitions`,
        }),
      ]);
      const statuses = [toPreparing.statusCode, toCancelled.statusCode].sort();
      expect(statuses).toEqual([200, 409]);

      const detail = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "GET",
        url: `/orders/${orderId}`,
      });
      const finalStatus = (detail.json() as { order: { status: string } }).order
        .status;
      expect(["preparing", "cancelled"]).toContain(finalStatus);
    } finally {
      await app.close();
    }
  });

  it("logger não registra capability token bruto na URL de tracking", async () => {
    const logLines: string[] = [];
    const loggerDestination = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(String(chunk));
        callback();
      },
    });
    const app = appForOrders({ loggerDestination });
    try {
      const created = await app.inject({
        headers: { "idempotency-key": `key-log-token-${runId}` },
        method: "POST",
        payload: validPayload({
          guest: { name: "Log Token", phone: "11911110000" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(created.statusCode).toBe(201);
      const token = (
        created.json() as { order: { accessToken: string } }
      ).order.accessToken;

      await app.inject({
        method: "GET",
        url: `/public/orders/${token}`,
      });

      const logs = logLines.join("");
      expect(logs).toContain('"/public/orders/[Redacted]"');
      expect(logs).not.toContain(token);
    } finally {
      await app.close();
    }
  });
});
