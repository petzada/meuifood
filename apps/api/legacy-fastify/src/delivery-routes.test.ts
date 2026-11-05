import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { Temporal } from "@js-temporal/polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAdministrativeDatabase,
  createBusinessDatabase,
  type BusinessDatabase,
} from "@foode/db";

import { buildApp } from "./app.js";

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
      "BUSINESS_DATABASE_URL é obrigatória para provar Delivery com RLS real.",
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

describe("Delivery taxa fixa/bairro + Retirada", { timeout: 90_000 }, () => {
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
  let fixedNow: Temporal.Instant;

  beforeAll(async () => {
    const { administrativeUrl, businessUrl } = await productionDatabaseUrls();
    administrativeDatabase = createAdministrativeDatabase(administrativeUrl);
    businessDatabase = createBusinessDatabase(businessUrl);
    await businessDatabase.assertRestrictedRuntime();

    storeASlug = `fixture-deliv-a-${runId}`;
    const storeA = await administrativeDatabase.store.create({
      data: {
        billingMode: "baas",
        contactPhoneE164: "5511988886666",
        name: `Fixture Delivery A ${runId}`,
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
        name: `Fixture Delivery B ${runId}`,
        pickupEnabled: true,
        slug: `fixture-deliv-b-${runId}`,
        taxId: syntheticTaxId(),
      },
    });
    createdStoreIds.push(storeB.id);
    ownerBUserId = randomUUID();
    await administrativeDatabase.storeMember.create({
      data: { role: "owner", storeId: storeB.id, userId: ownerBUserId },
    });

    const app = appForDelivery();
    try {
      const category = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { name: "Pratos" },
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
          name: "Prato",
          priceCents: 2000,
        },
        url: "/menu/items",
      });
      expect(item.statusCode).toBe(201);
      itemId = (item.json() as { item: { id: string } }).item.id;
    } finally {
      await app.close();
    }
  });

  afterAll(async () => {
    if (createdStoreIds.length > 0) {
      await administrativeDatabase.store.deleteMany({
        where: { id: { in: createdStoreIds } },
      });
      const leftover = await administrativeDatabase.store.count({
        where: { id: { in: createdStoreIds } },
      });
      expect(leftover).toBe(0);
    }
    await businessDatabase.close();
    await administrativeDatabase.$disconnect();
  });

  function appForDelivery() {
    return buildApp({
      businessDatabase,
      logger: false,
      now: () => fixedNow,
      verifyAccessToken: async (token) => {
        if (token === "owner-a") return { userId: ownerAUserId };
        if (token === "operator-a") return { userId: operatorUserId };
        if (token === "owner-b") return { userId: ownerBUserId };
        throw new Error("unauthorized");
      },
    });
  }

  function pickupPayload(overrides: Record<string, unknown> = {}) {
    return {
      fulfillmentType: "pickup",
      guest: { name: "Guest Pickup", phone: "11977776666" },
      lines: [{ additionalIds: [], complementSelections: {}, itemId, quantity: 1 }],
      paymentMethod: "on_delivery",
      ...overrides,
    };
  }

  function deliveryPayload(overrides: Record<string, unknown> = {}) {
    return {
      address: {
        complement: "Apto 1",
        neighborhood: "Centro",
        reference: "Perto do mercado",
        streetLine: "Rua das Flores, 10",
      },
      deliveryFeeCents: 1,
      fulfillmentType: "delivery",
      guest: { name: "Guest Delivery", phone: "11966665555" },
      lines: [{ additionalIds: [], complementSelections: {}, itemId, quantity: 1 }],
      paymentMethod: "on_delivery",
      totalCents: 1,
      ...overrides,
    };
  }

  it("Dono configura modo exclusivo; Operador e cross-store são bloqueados", async () => {
    const app = appForDelivery();
    try {
      const fixed = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { fixedDeliveryFeeCents: 700, mode: "fixed" },
        url: "/delivery/fee-mode",
      });
      expect(fixed.statusCode).toBe(200);
      expect(
        (fixed.json() as { delivery: { mode: string; fixedDeliveryFeeCents: number } })
          .delivery,
      ).toMatchObject({ fixedDeliveryFeeCents: 700, mode: "fixed" });

      const neighborhoodMode = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { mode: "neighborhood" },
        url: "/delivery/fee-mode",
      });
      expect(neighborhoodMode.statusCode).toBe(200);
      expect(
        (neighborhoodMode.json() as { delivery: { mode: string } }).delivery.mode,
      ).toBe("neighborhood");

      const created = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { feeCents: 450, name: "São  José" },
        url: "/delivery/neighborhoods",
      });
      expect(created.statusCode).toBe(201);

      const duplicate = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "POST",
        payload: { feeCents: 500, name: "sao jose" },
        url: "/delivery/neighborhoods",
      });
      expect(duplicate.statusCode).toBe(409);

      const operatorDenied = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "PUT",
        payload: { fixedDeliveryFeeCents: 100, mode: "fixed" },
        url: "/delivery/fee-mode",
      });
      expect(operatorDenied.statusCode).toBe(403);

      const crossStore = await app.inject({
        headers: { authorization: "Bearer owner-b" },
        method: "GET",
        url: "/delivery",
      });
      expect(crossStore.statusCode).toBe(200);
      expect(
        (crossStore.json() as { delivery: { neighborhoods: unknown[] } }).delivery
          .neighborhoods,
      ).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("Delivery taxa fixa ignora resíduos de bairro e rejeita adulteração de total", async () => {
    const app = appForDelivery();
    try {
      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { fixedDeliveryFeeCents: 800, mode: "fixed" },
        url: "/delivery/fee-mode",
      });

      const created = await app.inject({
        headers: { "idempotency-key": `key-fixed-${runId}` },
        method: "POST",
        payload: deliveryPayload({
          address: {
            neighborhood: "Ignorado",
            streetLine: "Av. Central, 50",
          },
          deliveryFeeCents: 1,
          totalCents: 1,
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(created.statusCode, created.body).toBe(201);
      const order = (
        created.json() as {
          order: {
            deliveryFeeCents: number;
            deliveryFeeModeSnapshot: string;
            totalCents: number;
          };
        }
      ).order;
      expect(order.deliveryFeeCents).toBe(800);
      expect(order.deliveryFeeModeSnapshot).toBe("fixed");
      expect(order.totalCents).toBe(2800);
    } finally {
      await app.close();
    }
  });

  it("bairro não atendido bloqueia Delivery e não impede Retirada", async () => {
    const app = appForDelivery();
    try {
      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { mode: "neighborhood" },
        url: "/delivery/fee-mode",
      });

      const blocked = await app.inject({
        headers: { "idempotency-key": `key-unserved-${runId}` },
        method: "POST",
        payload: deliveryPayload({
          address: {
            neighborhood: "Zona Rural",
            streetLine: "Rua Longe, 1",
          },
          guest: { name: "Fora Zona", phone: "11955554444" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(blocked.statusCode).toBe(409);
      expect((blocked.json() as { error: string }).error).toBe(
        "neighborhood_not_served",
      );

      const pickup = await app.inject({
        headers: { "idempotency-key": `key-pickup-ok-${runId}` },
        method: "POST",
        payload: pickupPayload({
          guest: { name: "Retirada Ok", phone: "11944443333" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(pickup.statusCode, pickup.body).toBe(201);
      expect(
        (pickup.json() as { order: { deliveryFeeCents: number; fulfillmentType: string } })
          .order,
      ).toMatchObject({ deliveryFeeCents: 0, fulfillmentType: "pickup" });
    } finally {
      await app.close();
    }
  });

  it("matching normalizado, snapshot imutável e transição out_for_delivery", async () => {
    const app = appForDelivery();
    try {
      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { mode: "neighborhood" },
        url: "/delivery/fee-mode",
      });

      const created = await app.inject({
        headers: { "idempotency-key": `key-snap-${runId}` },
        method: "POST",
        payload: deliveryPayload({
          address: {
            neighborhood: "sao jose",
            streetLine: "Rua Snapshot, 9",
          },
          guest: { name: "Snap", phone: "11933332222" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(created.statusCode, created.body).toBe(201);
      const body = created.json() as {
        order: {
          accessToken: string;
          deliveryAddress: { neighborhood: string; streetLine: string };
          deliveryFeeCents: number;
          deliveryFeeModeSnapshot: string;
          totalCents: number;
        };
      };
      expect(body.order.deliveryFeeCents).toBe(450);
      expect(body.order.deliveryFeeModeSnapshot).toBe("neighborhood");
      expect(body.order.deliveryAddress.neighborhood).toBe("São José");
      expect(body.order.totalCents).toBe(2450);

      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { fixedDeliveryFeeCents: 9999, mode: "fixed" },
        url: "/delivery/fee-mode",
      });

      const tracking = await app.inject({
        method: "GET",
        url: `/public/orders/${body.order.accessToken}`,
      });
      expect(tracking.statusCode).toBe(200);
      expect(
        (tracking.json() as { order: { deliveryFeeCents: number } }).order
          .deliveryFeeCents,
      ).toBe(450);

      const list = await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "GET",
        url: "/orders",
      });
      const orderId = (
        list.json() as { orders: Array<{ id: string; guestName: string }> }
      ).orders.find((order) => order.guestName === "Snap")!.id;

      const preparing = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "POST",
        payload: { to: "preparing" },
        url: `/orders/${orderId}/transitions`,
      });
      expect(preparing.statusCode).toBe(200);

      const readyDenied = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "POST",
        payload: { to: "ready_for_pickup" },
        url: `/orders/${orderId}/transitions`,
      });
      expect(readyDenied.statusCode).toBe(409);

      const out = await app.inject({
        headers: { authorization: "Bearer operator-a" },
        method: "POST",
        payload: { to: "out_for_delivery" },
        url: `/orders/${orderId}/transitions`,
      });
      expect(out.statusCode).toBe(200);
      expect(
        (out.json() as { order: { status: string } }).order.status,
      ).toBe("out_for_delivery");
    } finally {
      await app.close();
    }
  });

  it("Retirada independente; Delivery exige endereço; idempotência inclui endereço", async () => {
    const app = appForDelivery();
    try {
      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { pickupEnabled: false },
        url: "/delivery/pickup",
      });
      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { fixedDeliveryFeeCents: 300, mode: "fixed" },
        url: "/delivery/fee-mode",
      });

      const pickupBlocked = await app.inject({
        headers: { "idempotency-key": `key-pickup-off-${runId}` },
        method: "POST",
        payload: pickupPayload(),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(pickupBlocked.statusCode).toBe(409);
      expect((pickupBlocked.json() as { error: string }).error).toBe(
        "pickup_disabled",
      );

      const missingAddress = await app.inject({
        headers: { "idempotency-key": `key-no-addr-${runId}` },
        method: "POST",
        payload: {
          fulfillmentType: "delivery",
          guest: { name: "Sem End", phone: "11922221111" },
          lines: [
            { additionalIds: [], complementSelections: {}, itemId, quantity: 1 },
          ],
          paymentMethod: "on_delivery",
        },
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(missingAddress.statusCode).toBe(400);

      const first = await app.inject({
        headers: { "idempotency-key": `key-idem-addr-${runId}` },
        method: "POST",
        payload: deliveryPayload({
          address: {
            neighborhood: "Centro",
            streetLine: "Rua A, 1",
          },
          guest: { name: "Idem", phone: "11911112222" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(first.statusCode).toBe(201);

      const conflict = await app.inject({
        headers: { "idempotency-key": `key-idem-addr-${runId}` },
        method: "POST",
        payload: deliveryPayload({
          address: {
            neighborhood: "Centro",
            streetLine: "Rua B, 2",
          },
          guest: { name: "Idem", phone: "11911112222" },
        }),
        url: `/public/stores/${storeASlug}/orders`,
      });
      expect(conflict.statusCode).toBe(409);
      expect((conflict.json() as { error: string }).error).toBe(
        "idempotency_key_conflict",
      );

      await app.inject({
        headers: { authorization: "Bearer owner-a" },
        method: "PUT",
        payload: { pickupEnabled: true },
        url: "/delivery/pickup",
      });
    } finally {
      await app.close();
    }
  });
});
