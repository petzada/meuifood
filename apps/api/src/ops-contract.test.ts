// Contrato do Ticket 29 sem banco: enums do D1 = enums de @foode/shared/ops; a seed da
// migration 0002 = PLAN_TIERS_SEED/PROVIDER_COSTS_SEED; as RPCs Ops validam a entrada e só
// passam com OpsContext (Dono/Operador = `forbidden`). Regras com D1 ficam em *.d1.test.ts (CI).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIVATION_REQUIRED_CHECKS as DB_ACTIVATION_REQUIRED_CHECKS,
  BILLING_CYCLES as DB_BILLING_CYCLES,
  CARD_MODES as DB_CARD_MODES,
  FEE_PAYMENT_METHODS as DB_FEE_PAYMENT_METHODS,
  type FoodeDb,
  FoodeDbError,
  ONBOARDING_CHECKS as DB_ONBOARDING_CHECKS,
  OPS_AUDIT_ACTIONS as DB_OPS_AUDIT_ACTIONS,
  PAYMENT_PROVIDERS as DB_PAYMENT_PROVIDERS,
  PIX_KEY_TYPES as DB_PIX_KEY_TYPES,
  PROVIDER_OPERATIONS as DB_PROVIDER_OPERATIONS,
} from "@foode/db";
import {
  ACTIVATION_REQUIRED_CHECKS,
  BILLING_CYCLES,
  ONBOARDING_CHECKS,
  OPS_AUDIT_ACTIONS,
  CARD_MODES,
  FEE_PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PIX_KEY_TYPES,
  PLAN_TIERS_SEED,
  PLAN_TIERS_SEED_VALID_FROM,
  PROVIDER_COSTS_SEED,
  PROVIDER_COSTS_SEED_VALID_FROM,
  PROVIDER_OPERATIONS,
} from "@foode/shared/ops";
import { describe, expect, it } from "vitest";

import type { AuthSession, FoodeAuth } from "./auth/auth";
import { createOpsService } from "./ops-service";

const migration = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../packages/db/migrations/0002_ops_lojas_planos_taxas.sql",
  ),
  "utf8",
);

/** Linhas `(...)` do INSERT na tabela, como listas de literais SQL. */
function seedRows(table: string): string[][] {
  const statement = migration.match(
    new RegExp(`INSERT OR IGNORE INTO \`${table}\`[^;]*?VALUES([\\s\\S]*?);`),
  )?.[1];
  expect(statement, table).toBeDefined();
  return [...(statement ?? "").matchAll(/\(([^)]*)\)/g)].map((m) =>
    m[1]!.split(",").map((value) => value.trim().replace(/^'(.*)'$/, "$1")),
  );
}

describe("enums D1 × @foode/shared/ops", () => {
  it.each([
    ["CARD_MODES", DB_CARD_MODES, CARD_MODES],
    ["PIX_KEY_TYPES", DB_PIX_KEY_TYPES, PIX_KEY_TYPES],
    ["BILLING_CYCLES", DB_BILLING_CYCLES, BILLING_CYCLES],
    ["FEE_PAYMENT_METHODS", DB_FEE_PAYMENT_METHODS, FEE_PAYMENT_METHODS],
    ["PAYMENT_PROVIDERS", DB_PAYMENT_PROVIDERS, PAYMENT_PROVIDERS],
    ["PROVIDER_OPERATIONS", DB_PROVIDER_OPERATIONS, PROVIDER_OPERATIONS],
  ])("%s", (_name, db, shared) => {
    expect([...db]).toEqual([...shared]);
  });
});

describe("seed da migration 0002", () => {
  it("faixas = PLAN_TIERS_SEED (decisão 61)", () => {
    const rows = seedRows("plan_price_tiers").map(([, cycle, min, max, price, validFrom]) => ({
      cycle,
      minOrders: Number(min),
      maxOrders: max === "NULL" ? null : Number(max),
      priceCents: Number(price),
      validFrom,
    }));
    const expected = [
      ...PLAN_TIERS_SEED.monthlyTiers.map((tier) => ({ cycle: "monthly", ...tier })),
      {
        cycle: "annual",
        minOrders: 0,
        maxOrders: null,
        priceCents: PLAN_TIERS_SEED.annualPriceCents,
      },
    ].map((row) => ({ ...row, validFrom: PLAN_TIERS_SEED_VALID_FROM }));
    expect(rows).toEqual(expected);
  });

  it("custos = PROVIDER_COSTS_SEED", () => {
    const rows = seedRows("provider_costs").map(([, provider, operation, bps, fixed, from]) => ({
      provider,
      operation,
      percentBps: Number(bps),
      fixedCents: Number(fixed),
      validFrom: from,
    }));
    expect(rows).toEqual(
      PROVIDER_COSTS_SEED.map((cost) => ({ ...cost, validFrom: PROVIDER_COSTS_SEED_VALID_FROM })),
    );
  });
});

// ---- RPCs Ops com sessão e banco falsos (só o guard; nenhuma operação de dados é chamada) ----

const STORE_ID = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
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
    // Só alcançado com OpsContext; Dono/Operador nunca chegam aqui.
    ops: () => {
      if (who !== "ops") throw new Error("db.ops sem OpsContext");
      return {
        listPlanTierTables: async () => [],
        updateStore: async () => {
          throw new FoodeDbError("slug_unavailable");
        },
      };
    },
  } as unknown as FoodeDb;
  return createOpsService({ db, auth });
}

describe("RPCs Ops (contrato)", () => {
  it("entrada inválida = invalid_input antes de tocar a sessão", async () => {
    await expect(fakeService("anon").opsSetCardMode(caller, { cardMode: "x" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
  });

  it("sem sessão = unauthenticated", async () => {
    await expect(fakeService("anon").opsListStores(caller)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it.each(["owner", "operator"] as const)("%s = forbidden", async (who) => {
    const service = fakeService(who);
    await expect(service.opsListStores(caller)).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(
      service.opsSetCardMode(caller, { storeId: STORE_ID, cardMode: "normal" }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
  });

  it("foode_ops passa o guard e opera em db.ops(context)", async () => {
    await expect(fakeService("ops").opsListPlanTiers(caller)).resolves.toEqual({
      ok: true,
      data: [],
    });
  });

  it("FoodeDbError vira código (Slug usado = conflict)", async () => {
    await expect(
      fakeService("ops").opsUpdateStore(caller, { storeId: STORE_ID, slug: "loja-b" }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
  });
});

describe("constantes D1 × @foode/shared/ops", () => {
  it.each([
    ["ONBOARDING_CHECKS", DB_ONBOARDING_CHECKS, ONBOARDING_CHECKS],
    ["ACTIVATION_REQUIRED_CHECKS", DB_ACTIVATION_REQUIRED_CHECKS, ACTIVATION_REQUIRED_CHECKS],
    ["OPS_AUDIT_ACTIONS", DB_OPS_AUDIT_ACTIONS, OPS_AUDIT_ACTIONS],
  ])("%s", (_name, db, shared) => {
    expect([...db]).toEqual([...shared]);
  });
});
