// Ticket 14 no D1 do workerd: agregados do relatório (status/meio, período anterior, Top itens com
// Dom–Sáb, TOP 10 clientes só com conta e só da Loja, funil), Repasses do Dono e lotes do Ops
// (pendentes até o corte, lote idempotente e imutável, Estorno antes/depois do repasse, retenção,
// ajuste auditado, margem) e isolamento entre Lojas. Dados únicos por teste (fixture de duas Lojas).
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createFoodeDb, type FoodeDb, type OpsContext, type StoreContext } from "./index";
import {
  seedCustomerAccount,
  seedFinanceOrder,
  seedFunnelCounter,
  seedTwoStores,
  storeProfileFixture,
  type TwoStoresFixture,
} from "./testing";

let db: FoodeDb;
let fx: TwoStoresFixture;
let opsCtx: OpsContext;
let ownerA: StoreContext;
let ownerB: StoreContext;
let operatorA: StoreContext;

// Quinta-feira 2026-11-05, 12:00 em São Paulo; o período é a semana até ela.
const RANGE = {
  current: { fromUtc: "2026-10-30T03:00:00.000Z", toUtc: "2026-11-06T03:00:00.000Z" },
  previous: { fromUtc: "2026-10-23T03:00:00.000Z", toUtc: "2026-10-30T03:00:00.000Z" },
  from: "2026-10-30",
  to: "2026-11-05",
};

async function context(userId: string, storeId: string): Promise<StoreContext> {
  const ctx = await db.access.storeContext({ userId, storeId });
  if (!ctx) throw new Error("membership esperada");
  return ctx;
}

function ops() {
  return db.ops(opsCtx);
}

const ledger = (expectedPayoutDate: string, foodeFeeCents = 100) => ({
  foodeFeeCents,
  providerCostCents: 54,
  releaseDate: "2026-11-02",
  expectedPayoutDate,
});

async function due(storeId: string, asOf: string) {
  const { items } = await ops().payoutsDue(asOf);
  return items.filter((item) => item.storeId === storeId);
}

function sum(items: { amountCents: number }[]): number {
  return items.reduce((total, item) => total + item.amountCents, 0);
}

function markPaid(
  storeId: string,
  asOf: string,
  expectedAmountCents: number,
  key = crypto.randomUUID(),
) {
  return ops().markPayoutBatchPaid({
    storeId,
    asOf,
    paidOn: asOf,
    sourceAccount: "abacatepay",
    reference: "E2E-TESTE-1",
    transferCostCents: 80,
    expectedAmountCents,
    idempotencyKey: key,
  });
}

beforeEach(async () => {
  db = createFoodeDb(env.DB);
  fx = await seedTwoStores(env.DB);
  const context_ = await db.access.opsContext(fx.ops.id);
  if (!context_) throw new Error("ops esperado");
  opsCtx = context_;
  await ops().updateStore(fx.storeA.id, storeProfileFixture());
  ownerA = await context(fx.ownerA.id, fx.storeA.id);
  ownerB = await context(fx.ownerB.id, fx.storeB.id);
  operatorA = await context(fx.operatorA.id, fx.storeA.id);
});

describe("relatório (agregados no D1)", () => {
  it("conta por status/meio, separa o anterior, top itens Dom–Sáb e funil", async () => {
    const A = fx.storeA.id;
    // Sexta 30/10 (dia 5 = sexta em São Paulo) e quinta 05/11.
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-10-30T15:00:00.000Z",
      totalCents: 3000,
      lines: [{ menuItemId: "item-pastel", name: "Pastel", quantity: 2, unitPriceCents: 1500 }],
      ledger: ledger("2026-11-03"),
    });
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-05T15:00:00.000Z",
      method: "on_delivery",
      status: "preparing",
      totalCents: 2000,
      lines: [{ menuItemId: "item-pastel", name: "Pastel", quantity: 1, unitPriceCents: 2000 }],
    });
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-01T15:00:00.000Z",
      method: "on_delivery",
      status: "cancelled",
      totalCents: 999,
      lines: [{ menuItemId: "item-x", name: "Cancelado", quantity: 9, unitPriceCents: 111 }],
    });
    // Anterior (24/10) e fora de tudo (meia-noite de 30/10 em São Paulo = antes do corte).
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-10-24T15:00:00.000Z",
      method: "on_delivery",
      totalCents: 500,
    });
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-10-30T02:59:59.999Z",
      method: "on_delivery",
      totalCents: 700,
    });
    // Loja B no mesmo período não entra em A.
    await seedFinanceOrder(env.DB, {
      storeId: fx.storeB.id,
      createdAt: "2026-11-02T15:00:00.000Z",
      method: "on_delivery",
      totalCents: 99_000,
      lines: [{ name: "Item da B", quantity: 50, unitPriceCents: 1980 }],
    });
    await seedFunnelCounter(env.DB, A, "2026-11-02", "visit", 10);
    await seedFunnelCounter(env.DB, A, "2026-11-02", "order", 2);
    await seedFunnelCounter(env.DB, fx.storeB.id, "2026-11-02", "visit", 999);

    const rows = await db.store(ownerA).reports().report(RANGE);
    const byKey = (list: typeof rows.current) =>
      Object.fromEntries(
        list.map((r) => [`${r.status}/${r.paymentMethod}`, [r.orders, r.totalCents]]),
      );
    expect(byKey(rows.current)).toEqual({
      "completed/pix": [1, 3000],
      "preparing/on_delivery": [1, 2000],
      "cancelled/on_delivery": [1, 999],
    });
    expect(byKey(rows.previous)).toEqual({ "completed/on_delivery": [2, 1200] });
    const pastel = rows.items.filter((r) => r.itemKey === "item-pastel");
    expect(pastel.map((r) => [r.weekday, r.quantity]).sort()).toEqual([
      [4, 1],
      [5, 2],
    ]);
    expect(rows.items.some((r) => r.itemName === "Cancelado" || r.itemName === "Item da B")).toBe(
      false,
    );
    expect(rows.funnel).toEqual([
      { day: "2026-11-02", event: "order", count: 2 },
      { day: "2026-11-02", event: "visit", count: 10 },
    ]);
  });

  it("TOP 10 clientes: só com conta, sem Guest e sem Pedidos de outra Loja", async () => {
    const A = fx.storeA.id;
    const maria = await seedCustomerAccount(env.DB, "Maria Conta");
    const joao = await seedCustomerAccount(env.DB, "João Conta");
    const at = "2026-11-03T15:00:00.000Z";
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: at,
      method: "on_delivery",
      totalCents: 1000,
      customerAccountId: maria,
    });
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: at,
      method: "on_delivery",
      totalCents: 1500,
      customerAccountId: maria,
    });
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: at,
      method: "on_delivery",
      totalCents: 800,
      customerAccountId: joao,
    });
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: at,
      method: "on_delivery",
      status: "cancelled",
      totalCents: 50_000,
      customerAccountId: joao,
    });
    // Guest que compra muito na Loja A e o João gastando muito na Loja B.
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: at,
      method: "on_delivery",
      totalCents: 90_000,
      customerName: "Guest Grande",
    });
    await seedFinanceOrder(env.DB, {
      storeId: fx.storeB.id,
      createdAt: at,
      method: "on_delivery",
      totalCents: 80_000,
      customerAccountId: joao,
    });

    const { customers } = await db.store(ownerA).reports().report(RANGE);
    expect(customers).toEqual([
      { name: "Maria Conta", orders: 2, totalCents: 2500 },
      { name: "João Conta", orders: 1, totalCents: 800 },
    ]);
    for (const row of customers)
      expect(Object.keys(row).sort()).toEqual(["name", "orders", "totalCents"]);
  });

  it("Operador não lê relatório nem Repasses", async () => {
    await expect(db.store(operatorA).reports().report(RANGE)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      db
        .store(operatorA)
        .payouts()
        .lines({ from: "2026-11-01", to: "2026-11-30", ...RANGE.current }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      db.store(operatorA).payouts().batches("2026-11-01", "2026-11-30"),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("lotes de repasse (Ops)", () => {
  it("pendentes até o corte; lote idempotente, imutável e refletido nos Repasses do Dono", async () => {
    const A = fx.storeA.id;
    const first = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T15:00:00.000Z",
      totalCents: 5000,
      ledger: ledger("2026-11-03"),
    });
    const second = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T16:00:00.000Z",
      method: "credit",
      totalCents: 3000,
      ledger: ledger("2026-11-03", 200),
    });
    const future = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-04T15:00:00.000Z",
      totalCents: 4000,
      ledger: { ...ledger("2026-11-06"), releaseDate: "2026-11-04" },
    });
    await seedFinanceOrder(env.DB, {
      storeId: fx.storeB.id,
      createdAt: "2026-11-02T15:00:00.000Z",
      totalCents: 7000,
      ledger: ledger("2026-11-03"),
    });

    const pending = await due(A, "2026-11-03");
    expect(pending.map((i) => [i.kind, i.orderCode, i.amountCents])).toEqual([
      ["entry", first.code, 4900],
      ["entry", second.code, 2800],
    ]);
    expect(sum(pending)).toBe(7700);

    await expect(markPaid(A, "2026-11-03", 7600)).rejects.toMatchObject({ code: "conflict" });
    const key = crypto.randomUUID();
    const paid = await markPaid(A, "2026-11-03", 7700, key);
    expect(paid).toMatchObject({ amountCents: 7700, itemCount: 2, replayed: false });
    // Mesma chave = mesmo lote; outra chave = nada a repassar.
    await expect(markPaid(A, "2026-11-03", 7700, key)).resolves.toEqual({
      ...paid,
      replayed: true,
    });
    await expect(markPaid(A, "2026-11-03", 7700)).rejects.toMatchObject({ code: "conflict" });
    // Chave de um lote da Loja A usada para a Loja B não paga nada.
    await expect(markPaid(fx.storeB.id, "2026-11-03", 6900, key)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await due(A, "2026-11-03")).toEqual([]);

    const lines = await db.store(ownerA).payouts().lines({
      from: "2026-11-01",
      to: "2026-11-30",
      fromUtc: "2026-11-01T03:00:00.000Z",
      toUtc: "2026-12-01T03:00:00.000Z",
    });
    const byOrder = Object.fromEntries(lines.map((l) => [l.orderCode, l]));
    expect(byOrder[first.code]).toMatchObject({
      kind: "payment",
      paid: 1,
      batchId: paid.batchId,
      netCents: 4900,
      serviceFeeCents: 150,
    });
    expect(byOrder[future.code]).toMatchObject({ paid: 0, batchId: null });
    expect(lines.some((l) => "providerCostCents" in l || "transferCostCents" in l)).toBe(false);

    const batches = await db.store(ownerA).payouts().batches("2026-11-01", "2026-11-30");
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      id: paid.batchId,
      amountCents: 7700,
      sourceAccount: "abacatepay",
    });
    expect(await db.store(ownerB).payouts().batches("2026-11-01", "2026-11-30")).toEqual([]);

    const audit = await ops().storeAudit(A);
    expect(audit.find((a) => a.action === "payout.batch_paid")).toMatchObject({
      targetId: paid.batchId,
      actorUserId: fx.ops.id,
    });
  });

  it("Estorno antes do repasse sai do lote; depois do repasse vira débito compensado", async () => {
    const A = fx.storeA.id;
    const before = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T15:00:00.000Z",
      status: "preparing",
      totalCents: 5000,
      ledger: ledger("2026-11-03"),
    });
    const after = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T16:00:00.000Z",
      status: "preparing",
      totalCents: 3000,
      ledger: ledger("2026-11-03"),
    });

    // Antes: anulação; o lançamento some dos pendentes e aparece "anulado" no Dono.
    const cancelBefore = await db.store(ownerA).orders().cancel({
      orderId: before.orderId,
      from: null,
      reason: null,
      compensationPayoutDate: "2026-11-04",
    });
    expect(cancelBefore.ok).toBe(true);
    const pending = await due(A, "2026-11-03");
    expect(pending.map((i) => i.orderCode)).toEqual([after.code]);
    const paid = await markPaid(A, "2026-11-03", 2900);

    // Depois: débito compensado no próximo dia útil.
    const cancelAfter = await db.store(ownerA).orders().cancel({
      orderId: after.orderId,
      from: null,
      reason: null,
      compensationPayoutDate: "2026-11-04",
    });
    expect(cancelAfter.ok).toBe(true);
    expect(await due(A, "2026-11-03")).toEqual([]);
    const debit = await due(A, "2026-11-04");
    expect(debit.map((i) => [i.kind, i.amountCents])).toEqual([["debit", -2900]]);
    // Só débito = saldo negativo: não há lote a pagar.
    await expect(markPaid(A, "2026-11-04", 1)).rejects.toMatchObject({ code: "conflict" });

    // Novo lançamento compensa o débito no lote seguinte.
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-03T15:00:00.000Z",
      totalCents: 6000,
      ledger: { ...ledger("2026-11-04"), releaseDate: "2026-11-03" },
    });
    const next = await due(A, "2026-11-04");
    expect(sum(next)).toBe(5900 - 2900);
    const second = await markPaid(A, "2026-11-04", 3000);
    expect(second.itemCount).toBe(2);

    const lines = await db.store(ownerA).payouts().lines({
      from: "2026-11-01",
      to: "2026-11-30",
      fromUtc: "2026-11-01T03:00:00.000Z",
      toUtc: "2026-12-01T03:00:00.000Z",
    });
    const of = (code: number, kind: string) =>
      lines.find((l) => l.orderCode === code && l.kind === kind);
    expect(of(before.code, "payment")).toMatchObject({ annulled: 1, paid: 0 });
    expect(of(after.code, "payment")).toMatchObject({ paid: 1, batchId: paid.batchId });
    expect(of(after.code, "refund_debit")).toMatchObject({
      netCents: -2900,
      batchId: second.batchId,
      expectedPayoutDate: "2026-11-04",
    });
  });

  it("guarda: lançamento anulado entre a leitura e a escrita derruba o lote inteiro", async () => {
    const A = fx.storeA.id;
    const order = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T15:00:00.000Z",
      status: "preparing",
      totalCents: 5000,
      ledger: ledger("2026-11-03"),
    });
    // O lote vê 4900; o cancelamento chega antes da escrita (valor confirmado não bate mais).
    await db.store(ownerA).orders().cancel({
      orderId: order.orderId,
      from: null,
      reason: null,
      compensationPayoutDate: "2026-11-04",
    });
    await expect(markPaid(A, "2026-11-03", 4900)).rejects.toMatchObject({ code: "conflict" });
    const batches = await ops().payoutBatches(A, "2026-11-01", "2026-11-30");
    expect(batches).toEqual([]);
  });

  it("retenção do provedor tem repasse próprio; Loja sem conta de repasse não paga", async () => {
    const A = fx.storeA.id;
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T15:00:00.000Z",
      method: "credit",
      totalCents: 10_000,
      ledger: {
        ...ledger("2026-11-03", 500),
        retentions: [
          { amountCents: 1500, releaseDate: "2026-11-09", expectedPayoutDate: "2026-11-10" },
        ],
      },
    });
    expect((await due(A, "2026-11-03")).map((i) => [i.kind, i.amountCents])).toEqual([
      ["entry", 8000],
    ]);
    const ten = await due(A, "2026-11-10");
    expect(ten.map((i) => [i.kind, i.amountCents])).toEqual([
      ["entry", 8000],
      ["retention", 1500],
    ]);
    await markPaid(A, "2026-11-03", 8000);
    expect((await due(A, "2026-11-10")).map((i) => i.kind)).toEqual(["retention"]);

    // Loja B não tem cadastro de repasse (store_profiles).
    await seedFinanceOrder(env.DB, {
      storeId: fx.storeB.id,
      createdAt: "2026-11-02T15:00:00.000Z",
      totalCents: 1000,
      ledger: ledger("2026-11-03"),
    });
    await expect(markPaid(fx.storeB.id, "2026-11-03", 900)).rejects.toMatchObject({
      code: "conflict",
    });
    const { stores } = await ops().payoutsDue("2026-11-03");
    expect(stores.find((s) => s.storeId === fx.storeB.id)).toMatchObject({ pixKey: null });
    expect(stores.find((s) => s.storeId === A)).toBeUndefined();
  });

  it("ajuste auditado entra no próximo lote; lote de outra Loja = not_found", async () => {
    const A = fx.storeA.id;
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T15:00:00.000Z",
      totalCents: 5000,
      ledger: ledger("2026-11-03"),
    });
    const paid = await markPaid(A, "2026-11-03", 4900);

    await expect(
      ops().createPayoutAdjustment({
        storeId: fx.storeB.id,
        amountCents: 100,
        reason: "Correção do lote",
        batchId: paid.batchId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      ops().createPayoutAdjustment({
        storeId: crypto.randomUUID(),
        amountCents: 100,
        reason: "Sem Loja",
        batchId: null,
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    const { adjustmentId } = await ops().createPayoutAdjustment({
      storeId: A,
      amountCents: 250,
      reason: "Correção do lote",
      batchId: paid.batchId,
    });
    const pending = await due(A, "2026-11-03");
    expect(pending).toEqual([
      expect.objectContaining({
        kind: "adjustment",
        id: adjustmentId,
        amountCents: 250,
        reason: "Correção do lote",
      }),
    ]);
    const audit = await ops().storeAudit(A);
    expect(audit.find((a) => a.action === "payout.adjustment_created")).toMatchObject({
      targetId: adjustmentId,
    });

    const fix = await markPaid(A, "2026-11-03", 250);
    expect(fix.itemCount).toBe(1);
    // O lote original segue igual (imutável): mesmo valor e itens.
    const batches = await ops().payoutBatches(A, "2026-11-01", "2026-11-30");
    expect(batches.find((b) => b.id === paid.batchId)).toMatchObject({
      amountCents: 4900,
      itemCount: 1,
    });
  });

  it("margem por Loja: taxa Foode − custo do provedor − envio; Estorno devolve a taxa", async () => {
    const A = fx.storeA.id;
    await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T15:00:00.000Z",
      totalCents: 5000,
      ledger: ledger("2026-11-03", 300),
    });
    const refunded = await seedFinanceOrder(env.DB, {
      storeId: A,
      createdAt: "2026-11-02T16:00:00.000Z",
      status: "preparing",
      totalCents: 2000,
      ledger: { ...ledger("2026-11-03", 100), providerCostCents: null },
    });
    await db.store(ownerA).orders().cancel({
      orderId: refunded.orderId,
      from: null,
      reason: null,
      compensationPayoutDate: "2026-11-04",
    });
    await markPaid(A, "2026-11-03", 4700);

    const rows = await ops().marginByStore({
      from: "2026-11-01",
      to: "2026-11-30",
      fromUtc: "2026-11-01T03:00:00.000Z",
      toUtc: "2026-12-01T03:00:00.000Z",
    });
    const row = rows.find((r) => r.storeId === A);
    expect(row).toMatchObject({
      payments: 2,
      foodeFeeCents: 400,
      refundedFoodeFeeCents: 100,
      serviceFeeCents: 300,
      refundedServiceFeeCents: 150,
      providerCostCents: 54,
      providerCostUnknown: 1,
      transferCostCents: 80,
      batches: 1,
    });
  });
});
