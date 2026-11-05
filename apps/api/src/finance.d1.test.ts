// Ticket 14 no workerd com D1 (RPCs do PainelApi): RBAC do financeiro (Dono `store.finance`;
// Operador e Ops = forbidden no Dono; Dono/Operador = forbidden no Ops), relatório com comparativo
// e TOP 10 só com conta, CSV com BOM e sem dado pessoal, Repasses sem custo do provedor e lote
// idempotente pelo Ops. Relógio fixo (quinta 05/11/2026, 12:00 em São Paulo); fixture de duas Lojas.
import { env } from "cloudflare:test";
import { createFoodeDb, type FoodeDb } from "@foode/db";
import {
  seedCustomerAccount,
  seedFinanceOrder,
  seedFunnelCounter,
  seedTwoStores,
  storeProfileFixture,
  type TwoStoresFixture,
} from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import { CSV_BOM, CSV_FORBIDDEN_HEADERS } from "@foode/shared/finance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import type { EmailSender } from "./email/sender";
import { createFinanceService, type FinanceService } from "./finance-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
const NOW = new Date("2026-11-05T15:00:00.000Z");
const forbidden = { ok: false, error: "forbidden" };

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let finance: FinanceService;
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
      "x-captcha-response": CAPTCHA_OK,
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

const ledger = (expectedPayoutDate: string, foodeFeeCents = 100) => ({
  foodeFeeCents,
  providerCostCents: 54,
  releaseDate: "2026-11-02",
  expectedPayoutDate,
});

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const email: EmailSender = { send: async () => ({ id: "email" }) };
  auth = createAuth(env, { email, waitUntil: () => undefined });
  finance = createFinanceService({ db, auth, now: () => NOW });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === TURNSTILE_SITEVERIFY_URL) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { response?: string };
      return Response.json({ success: body.response === CAPTCHA_OK });
    }
    return realFetch(input, init);
  });
  const ops = await db.access.opsContext(fx.ops.id);
  await db.ops(ops!).updateStore(fx.storeA.id, storeProfileFixture());
});

afterEach(() => {
  vi.restoreAllMocks();
});

const WEEK = { period: { preset: "7d" } } as const;
const NOVEMBER = { from: "2026-11-01", to: "2026-11-30" };

describe("RBAC do financeiro (matriz de papéis)", () => {
  it("Dono lê; Operador e Ops recebem forbidden; sem sessão = unauthenticated", async () => {
    const owner = await loginAs(fx.ownerA);
    expect(data(await finance.reportsGet(owner, WEEK)).period.from).toBe("2026-10-30");
    expect(data(await finance.payoutsGet(owner, NOVEMBER)).today).toBe("2026-11-05");
    for (const caller of [await loginAs(fx.operatorA), await loginAs(fx.ops)]) {
      await expect(finance.reportsGet(caller, WEEK)).resolves.toEqual(forbidden);
      await expect(finance.reportsExportCsv(caller, WEEK)).resolves.toEqual(forbidden);
      await expect(finance.payoutsGet(caller, NOVEMBER)).resolves.toEqual(forbidden);
    }
    const anonymous = { cookie: "", ip: randomIp() };
    await expect(finance.reportsGet(anonymous, WEEK)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it("Dono e Operador não chegam às RPCs do Ops", async () => {
    for (const caller of [await loginAs(fx.ownerA), await loginAs(fx.operatorA)]) {
      await expect(finance.opsPayoutsDue(caller)).resolves.toEqual(forbidden);
      await expect(finance.opsMarginReport(caller, NOVEMBER)).resolves.toEqual(forbidden);
      await expect(
        finance.opsPayoutBatches(caller, { storeId: fx.storeA.id, ...NOVEMBER }),
      ).resolves.toEqual(forbidden);
      await expect(
        finance.opsPayoutAdjustmentCreate(caller, {
          storeId: fx.storeA.id,
          amountCents: 100,
          reason: "Tentativa",
        }),
      ).resolves.toEqual(forbidden);
    }
  });

  it("entrada inválida ou fim no futuro = invalid_input", async () => {
    const owner = await loginAs(fx.ownerA);
    await expect(
      finance.reportsGet(owner, {
        period: { preset: "custom", from: "2026-11-01", to: "2026-11-06" },
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      finance.reportsGet(owner, { period: { preset: "7d" }, storeId: fx.storeB.id }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    const ops = await loginAs(fx.ops);
    await expect(
      finance.opsPayoutMarkPaid(ops, {
        storeId: fx.storeA.id,
        asOf: "2026-11-06",
        paidOn: "2026-11-06",
        sourceAccount: "efi",
        reference: "E2E",
        transferCostCents: 0,
        expectedAmountCents: 100,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("relatório e CSV do Dono", () => {
  it("comparativo vs. 7 dias anteriores, TOP 10 sem Guest/outra Loja e funil", async () => {
    const A = fx.storeA.id;
    const maria = await seedCustomerAccount(env.DB, "Maria Fiel");
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-03T15:00:00.000Z",
      method: "on_delivery",
      totalCents: 3000,
      customerAccountId: maria,
      lines: [{ name: "Pastel", quantity: 3, unitPriceCents: 1000 }],
    });
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-04T15:00:00.000Z",
      totalCents: 5000,
      customerName: "Guest Gastão",
      ledger: ledger("2026-11-05"),
    });
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-10-25T15:00:00.000Z",
      method: "on_delivery",
      totalCents: 4000,
    });
    await seedFinanceOrder(env.DB, {
      storeId: fx.storeB.id,
      createdAt: "2026-11-03T15:00:00.000Z",
      method: "on_delivery",
      totalCents: 70_000,
      customerAccountId: maria,
    });
    await seedFunnelCounter(env.DB, A, "2026-11-03", "visit", 40);
    await seedFunnelCounter(env.DB, A, "2026-11-03", "order", 2);

    const owner = await loginAs(fx.ownerA);
    const report = data(await finance.reportsGet(owner, WEEK));
    expect(report.summary).toEqual({
      orders: 2,
      cancelled: 0,
      totalSoldCents: 8000,
      averageTicketCents: 4000,
      gmvCents: 5000,
    });
    expect(report.comparison.orders).toMatchObject({
      previous: 1,
      changeBps: 10000,
      direction: "up",
    });
    expect(report.period.comparisonLabel).toBe("7 dias anteriores");
    expect(report.topCustomers).toEqual([
      { rank: 1, name: "Maria Fiel", orders: 1, totalCents: 3000 },
    ]);
    expect(report.topItems[0]).toMatchObject({
      name: "Pastel",
      quantity: 3,
      byWeekday: [0, 0, 3, 0, 0, 0, 0],
    });
    expect(report.funnel.totals).toMatchObject({ visit: 40, order: 2 });
    expect(report.empty).toBe(false);

    const csv = data(await finance.reportsExportCsv(owner, WEEK));
    expect(csv.filename).toBe(`relatorio-${fx.storeA.slug}-2026-10-30-a-2026-11-05.csv`);
    expect(csv.contentType).toBe("text/csv; charset=utf-8");
    expect(csv.csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.csv).toContain("Total vendido (R$);80,00;40,00;100,00");
    for (const secret of ["Maria Fiel", "Guest Gastão", "5511"])
      expect(csv.csv).not.toContain(secret);
    for (const header of CSV_FORBIDDEN_HEADERS) expect(csv.csv.toLowerCase()).not.toContain(header);

    const ownerB = await loginAs(fx.ownerB);
    const reportB = data(await finance.reportsGet(ownerB, WEEK));
    expect(reportB.summary.totalSoldCents).toBe(70_000);
    expect(reportB.topCustomers).toEqual([
      { rank: 1, name: "Maria Fiel", orders: 1, totalCents: 70_000 },
    ]);
  });

  it("período sem Pedido volta vazio", async () => {
    const owner = await loginAs(fx.ownerA);
    const report = data(await finance.reportsGet(owner, { period: { preset: "today" } }));
    expect(report.empty).toBe(true);
    expect(report.topCustomers).toEqual([]);
  });
});

describe("Repasses (Dono) e lote do dia (Ops)", () => {
  it("lote idempotente pelo Ops; Dono vê Pago/Em lote/Previsto sem custo do provedor", async () => {
    const A = fx.storeA.id;
    const paidOrder = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T15:00:00.000Z",
      totalCents: 5000,
      ledger: ledger("2026-11-03"),
    });
    const today = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-04T15:00:00.000Z",
      totalCents: 2000,
      ledger: { ...ledger("2026-11-05"), releaseDate: "2026-11-04" },
    });
    const future = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-05T15:00:00.000Z",
      totalCents: 1000,
      ledger: { ...ledger("2026-11-06"), releaseDate: "2026-11-05" },
    });

    const ops = await loginAs(fx.ops);
    const dueView = data(await finance.opsPayoutsDue(ops));
    expect(dueView).toMatchObject({ asOf: "2026-11-05", isBusinessDay: true });
    const storeDue = dueView.stores.find((store) => store.storeId === A)!;
    expect(storeDue).toMatchObject({
      amountCents: 6800,
      itemCount: 2,
      payable: true,
      payout: { pixKeyType: "cpf", holderName: "Titular do Repasse" },
    });
    expect(storeDue.items.map((item) => item.orderCode)).toEqual([paidOrder.code, today.code]);

    const input = {
      storeId: A,
      asOf: "2026-11-05",
      paidOn: "2026-11-05",
      sourceAccount: "abacatepay" as const,
      reference: "E2E123456",
      transferCostCents: 80,
      expectedAmountCents: 6800,
      idempotencyKey: crypto.randomUUID(),
    };
    const first = data(await finance.opsPayoutMarkPaid(ops, input));
    expect(first).toMatchObject({ amountCents: 6800, itemCount: 2, replayed: false });
    expect(data(await finance.opsPayoutMarkPaid(ops, input))).toEqual({ ...first, replayed: true });
    await expect(
      finance.opsPayoutMarkPaid(ops, { ...input, idempotencyKey: crypto.randomUUID() }),
    ).resolves.toEqual({ ok: false, error: "conflict" });

    const owner = await loginAs(fx.ownerA);
    const view = data(await finance.payoutsGet(owner, NOVEMBER));
    const status = Object.fromEntries(view.lines.map((line) => [line.orderCode, line.status]));
    expect(status).toEqual({
      [paidOrder.code]: "paid",
      [today.code]: "paid",
      [future.code]: "scheduled",
    });
    expect(view.totals.paid).toEqual({ count: 2, netCents: 6800 });
    expect(view.batches).toEqual([
      expect.objectContaining({ id: first.batchId, amountCents: 6800, reference: "E2E123456" }),
    ]);
    const text = JSON.stringify(view);
    for (const hidden of ["providerCost", "transferCost", "createdByUserId"]) {
      expect(text).not.toContain(hidden);
    }

    const batches = data(await finance.opsPayoutBatches(ops, { storeId: A, ...NOVEMBER }));
    expect(batches[0]).toMatchObject({ transferCostCents: 80, createdByUserId: fx.ops.id });
    const margin = data(await finance.opsMarginReport(ops, NOVEMBER));
    expect(margin.stores.find((store) => store.storeId === A)).toMatchObject({
      foodeFeeCents: 300,
      providerCostCents: 162,
      transferCostCents: 80,
      marginCents: 300 - 162 - 80,
      serviceFeeCents: 450,
    });

    // Loja B: o Dono da B não vê nada da A.
    const ownerB = await loginAs(fx.ownerB);
    expect(data(await finance.payoutsGet(ownerB, NOVEMBER)).lines).toEqual([]);
  });

  it("ajuste com lote de outra Loja = not_found", async () => {
    const A = fx.storeA.id;
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T15:00:00.000Z",
      totalCents: 5000,
      ledger: ledger("2026-11-03"),
    });
    const ops = await loginAs(fx.ops);
    const batch = data(
      await finance.opsPayoutMarkPaid(ops, {
        storeId: A,
        asOf: "2026-11-05",
        paidOn: "2026-11-05",
        sourceAccount: "efi",
        reference: "E2E-1",
        transferCostCents: 0,
        expectedAmountCents: 4900,
        idempotencyKey: crypto.randomUUID(),
      }),
    );
    await expect(
      finance.opsPayoutAdjustmentCreate(ops, {
        storeId: fx.storeB.id,
        amountCents: -100,
        reason: "Correção",
        batchId: batch.batchId,
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    const created = data(
      await finance.opsPayoutAdjustmentCreate(ops, {
        storeId: A,
        amountCents: -100,
        reason: "Correção",
        batchId: batch.batchId,
      }),
    );
    // O ajuste é datado pelo relógio real do banco: consulta a janela em volta de agora.
    const owner = await loginAs(fx.ownerA);
    const realToday = new Date().toISOString().slice(0, 10);
    const around = {
      from: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
      to: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    };
    expect(around.from < realToday).toBe(true);
    const view = data(await finance.payoutsGet(owner, around));
    expect(view.lines.find((line) => line.id === created.adjustmentId)).toMatchObject({
      kind: "adjustment",
      status: "in_batch",
      netCents: -100,
      reason: "Correção",
    });
  });
});
