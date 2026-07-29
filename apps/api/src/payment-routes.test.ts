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
import { createControlledWooviAdapter } from "./woovi-adapter.js";

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
      "BUSINESS_DATABASE_URL é obrigatória para provar PIX com RLS real.",
    );
  }
  const businessUrl = new URL(businessUrlValue);
  if (
    businessUrl.hostname !== url.hostname ||
    businessUrl.pathname !== url.pathname
  ) {
    throw new Error(
      "BUSINESS_DATABASE_URL deve apontar ao mesmo pooler do Supabase de produção.",
    );
  }
  return {
    administrativeUrl: url.toString(),
    businessUrl: businessUrlValue,
  };
}

function syntheticTaxId() {
  return [...randomBytes(14)].map((byte) => String(byte % 10)).join("");
}

describe("Ticket 10 — PIX Woovi pilot_platform (Seam 1+2)", () => {
  const runId = (process.env.CI_RUN_ID?.trim() || randomUUID()).slice(0, 8);
  const suffix = randomBytes(3).toString("hex");
  const ownerUserId = randomUUID();
  const operatorUserId = randomUUID();
  const now = Temporal.Instant.from("2026-07-29T15:00:00.000Z");
  const opsToken = `ops-token-${runId}-${suffix}`;

  let administrative: ReturnType<typeof createAdministrativeDatabase>;
  let businessDatabase: BusinessDatabase;
  let pilotStoreId = "";
  let deniedStoreId = "";
  let categoryId = "";
  let itemId = "";
  let deniedCategoryId = "";
  let deniedItemId = "";
  let createCalls = 0;
  let createdPilotStore = false;

  const wooviAdapter = createControlledWooviAdapter(async (input) => {
    createCalls += 1;
    return {
      brCode: `00020126BR.GOV.BCB.PIX${input.correlationId}`,
      expiresAt: "2026-07-29T16:00:00.000Z",
      providerChargeId: `global-${input.correlationId}`,
      qrCodeImage: `https://example.test/qr/${input.correlationId}.png`,
    };
  });

  const wooviClient = {
    charge: {
      create: async () => {
        throw new Error("sdk_charge_should_go_through_adapter");
      },
    },
    webhook: {
      handler: (config: {
        onChargeCompleted?: (payload: unknown) => Promise<unknown> | unknown;
        onChargeCreated?: (payload: unknown) => Promise<unknown> | unknown;
        onChargeExpired?: (payload: unknown) => Promise<unknown> | unknown;
      }) => ({
        POST: async (req: Request) => {
          const signature = req.headers.get("x-webhook-signature");
          if (signature !== "valid-test-signature") {
            return new Response("invalid signature", { status: 400 });
          }
          const payload = (await req.json()) as {
            event?: string;
          };
          if (payload.event === "OPENPIX:CHARGE_COMPLETED") {
            await config.onChargeCompleted?.(payload);
          } else if (payload.event === "OPENPIX:CHARGE_CREATED") {
            await config.onChargeCreated?.(payload);
          } else if (payload.event === "OPENPIX:CHARGE_EXPIRED") {
            await config.onChargeExpired?.(payload);
          }
          return new Response("ok", { status: 200 });
        },
      }),
    },
  };

  beforeAll(async () => {
    const urls = await productionDatabaseUrls();
    administrative = createAdministrativeDatabase(urls.administrativeUrl);
    businessDatabase = createBusinessDatabase(urls.businessUrl);
    await businessDatabase.assertRestrictedRuntime();

    const existingPilot = await administrative.store.findFirst({
      where: { billingMode: "pilot_platform" },
      select: { id: true },
    });
    if (existingPilot) {
      pilotStoreId = existingPilot.id;
    } else {
      createdPilotStore = true;
      pilotStoreId = (
        await administrative.store.create({
          data: {
            billingMode: "pilot_platform",
            name: `PIX Pilot ${runId}`,
            slug: `pix-pilot-${runId}-${suffix}`,
            taxId: syntheticTaxId(),
            paused: false,
            pickupEnabled: true,
          },
          select: { id: true },
        })
      ).id;
    }

    await administrative.storeMember.createMany({
      data: [
        { role: "owner", storeId: pilotStoreId, userId: ownerUserId },
        { role: "operator", storeId: pilotStoreId, userId: operatorUserId },
      ],
      skipDuplicates: true,
    });

    deniedStoreId = (
      await administrative.store.create({
        data: {
          billingMode: "baas",
          name: `PIX Denied ${runId}`,
          slug: `pix-denied-${runId}-${suffix}`,
          taxId: syntheticTaxId(),
          paused: false,
          pickupEnabled: true,
        },
        select: { id: true },
      })
    ).id;

    categoryId = (
      await administrative.menuCategory.create({
        data: {
          name: `PIX Cat ${runId}`,
          sortOrder: 90,
          storeId: pilotStoreId,
        },
        select: { id: true },
      })
    ).id;
    itemId = (
      await administrative.menuItem.create({
        data: {
          available: true,
          categoryId,
          description: "Item PIX",
          name: `Prato PIX ${runId}`,
          priceCents: 10_000,
          storeId: pilotStoreId,
        },
        select: { id: true },
      })
    ).id;

    deniedCategoryId = (
      await administrative.menuCategory.create({
        data: {
          name: "Negado",
          sortOrder: 0,
          storeId: deniedStoreId,
        },
        select: { id: true },
      })
    ).id;
    deniedItemId = (
      await administrative.menuItem.create({
        data: {
          available: true,
          categoryId: deniedCategoryId,
          description: "Item",
          name: "Prato baas",
          priceCents: 2000,
          storeId: deniedStoreId,
        },
        select: { id: true },
      })
    ).id;

    for (const storeId of [pilotStoreId, deniedStoreId]) {
      await administrative.storeOperatingPeriod.createMany({
        data: [
          {
            closesAt: "23:59",
            opensAt: "00:00",
            storeId,
            weekday: 3,
          },
        ],
        skipDuplicates: true,
      });
    }
  }, 120_000);

  afterAll(async () => {
    if (deniedStoreId) {
      await administrative.store
        .delete({ where: { id: deniedStoreId } })
        .catch(() => undefined);
    }
    if (pilotStoreId) {
      await administrative.order
        .deleteMany({
          where: {
            storeId: pilotStoreId,
            guestName: { startsWith: `PIX Guest ${runId}` },
          },
        })
        .catch(() => undefined);
      if (itemId) {
        await administrative.menuItem
          .deleteMany({ where: { id: itemId } })
          .catch(() => undefined);
      }
      if (categoryId) {
        await administrative.menuCategory
          .deleteMany({ where: { id: categoryId } })
          .catch(() => undefined);
      }
      await administrative.storeMember
        .deleteMany({
          where: {
            storeId: pilotStoreId,
            userId: { in: [ownerUserId, operatorUserId] },
          },
        })
        .catch(() => undefined);
    }
    await businessDatabase.close();
    await administrative.$disconnect();
  }, 120_000);

  function app() {
    return buildApp({
      businessDatabase,
      logger: false,
      now: () => now,
      opsApiToken: opsToken,
      verifyAccessToken: async (token) => {
        if (token === "owner-a") return { userId: ownerUserId };
        if (token === "operator-a") return { userId: operatorUserId };
        throw new Error("invalid");
      },
      wooviAdapter,
      wooviClient,
    });
  }

  async function pilotSlug() {
    const store = await administrative.store.findFirstOrThrow({
      where: { id: pilotStoreId },
      select: { slug: true },
    });
    return store.slug;
  }

  it("permite PIX só em pilot_platform e nega em baas", async () => {
    const server = app();
    const slug = await pilotSlug();
    const denied = await administrative.store.findFirstOrThrow({
      where: { id: deniedStoreId },
      select: { slug: true },
    });

    const allowed = await server.inject({
      method: "POST",
      path: `/public/stores/${slug}/orders`,
      headers: { "idempotency-key": `pix-ok-${runId}-${suffix}` },
      payload: {
        fulfillmentType: "pickup",
        guest: { name: `PIX Guest ${runId}`, phone: "11987654321" },
        lines: [{ additionalIds: [], complementOptionIds: [], itemId, quantity: 1 }],
        paymentMethod: "pix",
      },
    });
    expect(allowed.statusCode).toBe(201);
    const allowedBody = allowed.json() as {
      order: {
        accessToken: string;
        paymentMethod: string;
        paymentStatus: string;
        pix?: { brCode: string; qrCodeImage: string };
        totalCents: number;
      };
    };
    expect(allowedBody.order.paymentMethod).toBe("pix");
    expect(allowedBody.order.paymentStatus).toBe("awaiting_payment");
    expect(allowedBody.order.pix?.brCode).toContain("BR.GOV.BCB.PIX");
    expect(allowedBody.order.pix?.qrCodeImage).toContain("https://");
    expect(JSON.stringify(allowedBody)).not.toMatch(/WOOVI|appId|secret/iu);

    const deniedRes = await server.inject({
      method: "POST",
      path: `/public/stores/${denied.slug}/orders`,
      headers: { "idempotency-key": `pix-deny-${runId}-${suffix}` },
      payload: {
        fulfillmentType: "pickup",
        guest: { name: `PIX Guest ${runId}`, phone: "11987654321" },
        lines: [
          {
            additionalIds: [],
            complementOptionIds: [],
            itemId: deniedItemId,
            quantity: 1,
          },
        ],
        paymentMethod: "pix",
      },
    });
    expect(deniedRes.statusCode).toBe(409);
    expect(deniedRes.json()).toEqual({ error: "billing_mode_not_allowed" });
  }, 60_000);

  it("criação PIX é idempotente sob concorrência e não duplica cobrança", async () => {
    createCalls = 0;
    const server = app();
    const slug = await pilotSlug();
    const key = `pix-idem-${runId}-${suffix}`;
    const payload = {
      fulfillmentType: "pickup" as const,
      guest: { name: `PIX Guest ${runId}`, phone: "11987654321" },
      lines: [{ additionalIds: [], complementOptionIds: [], itemId, quantity: 1 }],
      paymentMethod: "pix" as const,
    };
    const [a, b] = await Promise.all([
      server.inject({
        method: "POST",
        path: `/public/stores/${slug}/orders`,
        headers: { "idempotency-key": key },
        payload,
      }),
      server.inject({
        method: "POST",
        path: `/public/stores/${slug}/orders`,
        headers: { "idempotency-key": key },
        payload,
      }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(201);
    const bodies = [a.json(), b.json()] as Array<{
      order: { pix?: { correlationId: string } };
    }>;
    const correlations = bodies
      .map((body) => body.order.pix?.correlationId)
      .filter(Boolean);
    expect(new Set(correlations).size).toBe(1);
    expect(createCalls).toBeLessThanOrEqual(2);
  }, 60_000);

  it("webhook inválido rejeita; válido confirma Pedido e cria Ledger único", async () => {
    const server = app();
    const slug = await pilotSlug();
    const created = await server.inject({
      method: "POST",
      path: `/public/stores/${slug}/orders`,
      headers: { "idempotency-key": `pix-wh-${runId}-${suffix}` },
      payload: {
        fulfillmentType: "pickup",
        guest: { name: `PIX Guest ${runId}`, phone: "11987654321" },
        lines: [{ additionalIds: [], complementOptionIds: [], itemId, quantity: 1 }],
        paymentMethod: "pix",
      },
    });
    expect(created.statusCode).toBe(201);
    const order = (
      created.json() as {
        order: {
          accessToken: string;
          pix: { correlationId: string };
          totalCents: number;
        };
      }
    ).order;

    const invalid = await server.inject({
      method: "POST",
      path: "/webhooks/woovi",
      headers: { "x-webhook-signature": "bad" },
      payload: { event: "OPENPIX:CHARGE_COMPLETED" },
    });
    expect(invalid.statusCode).toBe(400);

    const completedPayload = {
      charge: {
        correlationID: order.pix.correlationId,
        status: "COMPLETED",
        transactionID: `tx-${runId}`,
        value: order.totalCents,
      },
      event: "OPENPIX:CHARGE_COMPLETED",
    };

    const first = await server.inject({
      method: "POST",
      path: "/webhooks/woovi",
      headers: { "x-webhook-signature": "valid-test-signature" },
      payload: completedPayload,
    });
    expect(first.statusCode).toBe(200);

    const tracking = await server.inject({
      method: "GET",
      path: `/public/orders/${order.accessToken}`,
    });
    expect(tracking.statusCode).toBe(200);
    const tracked = tracking.json() as {
      order: { paymentStatus: string; pix?: { status: string } };
    };
    expect(tracked.order.paymentStatus).toBe("paid");
    expect(tracked.order.pix?.status).toBe("completed");

    const duplicate = await server.inject({
      method: "POST",
      path: "/webhooks/woovi",
      headers: { "x-webhook-signature": "valid-test-signature" },
      payload: completedPayload,
    });
    expect(duplicate.statusCode).toBe(200);

    const outOfOrder = await server.inject({
      method: "POST",
      path: "/webhooks/woovi",
      headers: { "x-webhook-signature": "valid-test-signature" },
      payload: {
        charge: {
          correlationID: order.pix.correlationId,
          status: "ACTIVE",
          transactionID: `tx-old-${runId}`,
          value: order.totalCents,
        },
        event: "OPENPIX:CHARGE_CREATED",
      },
    });
    expect(outOfOrder.statusCode).toBe(200);

    const trackingAgain = await server.inject({
      method: "GET",
      path: `/public/orders/${order.accessToken}`,
    });
    expect(
      (trackingAgain.json() as { order: { paymentStatus: string } }).order
        .paymentStatus,
    ).toBe("paid");

    const ledgers = await administrative.ledgerEntry.findMany({
      where: {
        storeId: pilotStoreId,
        charge: { correlationId: order.pix.correlationId },
      },
    });
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]?.feeBps).toBe(119);
    expect(ledgers[0]?.feeCents).toBe(119);
    expect(ledgers[0]?.netCents).toBe(9_881);
    expect(ledgers[0]?.paidAt).toBeNull();
    expect(ledgers[0]?.grossCents).toBe(10_000);

    const mark = await server.inject({
      method: "POST",
      path: `/ops/ledger-entries/${ledgers[0]!.id}/mark-paid`,
      headers: { authorization: `Bearer ${opsToken}` },
    });
    expect(mark.statusCode).toBe(200);
    expect((mark.json() as { ledgerEntry: { paidAt: string } }).ledgerEntry.paidAt).toBeTruthy();

    const ownerDenied = await server.inject({
      method: "POST",
      path: `/ops/ledger-entries/${ledgers[0]!.id}/mark-paid`,
      headers: { authorization: "Bearer owner-a" },
    });
    expect(ownerDenied.statusCode).toBe(403);

    const operatorDenied = await server.inject({
      method: "POST",
      path: `/ops/ledger-entries/${ledgers[0]!.id}/mark-paid`,
      headers: { authorization: "Bearer operator-a" },
    });
    expect(operatorDenied.statusCode).toBe(403);
  }, 90_000);

  it("on_delivery continua sem cobrança/Ledger", async () => {
    const server = app();
    const slug = await pilotSlug();
    const created = await server.inject({
      method: "POST",
      path: `/public/stores/${slug}/orders`,
      headers: { "idempotency-key": `cod-${runId}-${suffix}` },
      payload: {
        fulfillmentType: "pickup",
        guest: { name: `PIX Guest ${runId}`, phone: "11987654321" },
        lines: [{ additionalIds: [], complementOptionIds: [], itemId, quantity: 1 }],
        paymentMethod: "on_delivery",
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      order: { paymentMethod: string; paymentStatus: string; pix?: unknown };
    };
    expect(body.order.paymentMethod).toBe("on_delivery");
    expect(body.order.paymentStatus).toBe("not_required");
    expect(body.order.pix).toBeUndefined();
  }, 60_000);
});
