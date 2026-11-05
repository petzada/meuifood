// Operações Ops (Ticket 29) no D1 do workerd (só CI): vigência conferida contra o gravado,
// auditoria before/after no mesmo batch, Slug duplicado, ativação sem Plano recusada e
// isolamento entre Lojas. Dados globais (faixas, custos, taxa padrão) usam datas próprias por
// teste, para não depender de isolamento de storage entre testes.
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createFoodeDb, type FoodeDb, type OpsContext } from "./index";
import { seedTwoStores, storeProfileFixture, type TwoStoresFixture } from "./testing";

let db: FoodeDb;
let fx: TwoStoresFixture;
let ctx: OpsContext;

const PAST = "2026-01-01T00:00:00.000Z";

function ops() {
  return db.ops(ctx);
}

function slug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function newStore(prefix = "nova") {
  return ops().createStore({ slug: slug(prefix), name: "Loja Nova", ...storeProfileFixture() });
}

async function actions(storeId: string): Promise<string[]> {
  return (await ops().storeAudit(storeId)).map((entry) => entry.action);
}

async function feeCount(storeId: string | null): Promise<number> {
  return (await ops().listPaymentFees(storeId)).length;
}

beforeEach(async () => {
  db = createFoodeDb(env.DB);
  fx = await seedTwoStores(env.DB);
  const context = await db.access.opsContext(fx.ops.id);
  if (!context) throw new Error("ops esperado na fixture");
  ctx = context;
});

describe("cadastro de Loja", () => {
  it("nasce onboarding, com perfil 1:1 e auditoria before/after", async () => {
    const { storeId } = await newStore();
    const detail = await ops().getStore(storeId);
    expect(detail.status).toBe("onboarding");
    expect(detail.cnpj).toBe("11222333000181");
    expect(detail.payout).toMatchObject({ pixKeyType: "cpf", pixKey: "52998224725" });
    expect(detail.cardMode).toBeNull();

    const [created] = await ops().storeAudit(storeId);
    expect(created).toMatchObject({ action: "store.created", actorUserId: fx.ops.id });
    expect(created!.before).toBeNull();
    expect(created!.after).toMatchObject({
      status: "onboarding",
      profile: { cnpj: "11222333000181" },
    });
    await expect(db.storefront.publicStoreBySlug(detail.slug)).resolves.toBeNull();
  });

  it("Slug duplicado = slug_unavailable e nada é gravado", async () => {
    const before = (await ops().listStores()).length;
    await expect(
      ops().createStore({ slug: fx.storeA.slug, name: "Outra", ...storeProfileFixture() }),
    ).rejects.toMatchObject({ code: "slug_unavailable" });
    expect((await ops().listStores()).length).toBe(before);

    const { storeId } = await newStore();
    await expect(ops().updateStore(storeId, { slug: fx.storeB.slug })).rejects.toMatchObject({
      code: "slug_unavailable",
    });
    expect(await actions(storeId)).toEqual(["store.created"]);
  });

  it("edição muda só os campos enviados e audita antes/depois", async () => {
    const { storeId } = await newStore();
    await ops().updateStore(storeId, { name: "Nome Novo", whatsapp: "5521987654321" });
    const detail = await ops().getStore(storeId);
    expect(detail).toMatchObject({ name: "Nome Novo", whatsapp: "5521987654321" });
    expect(detail.cnpj).toBe("11222333000181");

    const updated = (await ops().storeAudit(storeId)).find(
      (entry) => entry.action === "store.updated",
    );
    expect(updated).toBeDefined();
    expect(updated!.before).toMatchObject({
      name: "Loja Nova",
      profile: { whatsapp: "5511987654321" },
    });
    expect(updated!.after).toMatchObject({
      name: "Nome Novo",
      profile: { whatsapp: "5521987654321" },
    });
  });

  it("Loja antiga sem perfil: detalhe com perfil null; perfil nasce só com cadastro completo", async () => {
    const legacy = await ops().getStore(fx.storeA.id);
    expect(legacy.address).toBeNull();
    expect(legacy.onboarding.find((item) => item.check === "profile")?.done).toBe(false);

    await expect(
      ops().updateStore(fx.storeA.id, { whatsapp: "5511987654321" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(ops().setCardMode(fx.storeA.id, "normal")).rejects.toMatchObject({
      code: "conflict",
    });

    await ops().updateStore(fx.storeA.id, storeProfileFixture());
    expect((await ops().getStore(fx.storeA.id)).cnpj).toBe("11222333000181");
  });

  it("Loja inexistente = not_found", async () => {
    await expect(ops().getStore(crypto.randomUUID())).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("estado da Loja", () => {
  it("ativar sem Plano vigente é recusado e nada muda", async () => {
    const { storeId } = await newStore();
    await ops().inviteOwner(storeId, { email: `dono-${crypto.randomUUID()}@foode.test` });
    await expect(
      ops().changeStoreStatus(storeId, "active", { allowedFrom: ["onboarding", "suspended"] }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await ops().getStore(storeId)).status).toBe("onboarding");
    expect(await actions(storeId)).not.toContain("store.status_changed");
  });

  it("Plano futuro não ativa; Plano vigente + Dono ativa; suspender leva motivo", async () => {
    const { storeId } = await newStore();
    await ops().inviteOwner(storeId, { email: `dono-${crypto.randomUUID()}@foode.test` });
    await ops().setStorePlan(storeId, { cycle: "monthly", validFrom: "2099-01-01T00:00:00.000Z" });
    await expect(
      ops().changeStoreStatus(storeId, "active", { allowedFrom: ["onboarding"] }),
    ).rejects.toMatchObject({ code: "conflict" });

    // Já há Plano a partir de 2099: inserir um antes dele é conflito.
    await expect(
      ops().setStorePlan(storeId, { cycle: "annual", validFrom: PAST }),
    ).rejects.toMatchObject({ code: "conflict" });
    const other = await newStore();
    await ops().inviteOwner(other.storeId, { email: `dono-${crypto.randomUUID()}@foode.test` });
    await ops().setStorePlan(other.storeId, { cycle: "monthly", validFrom: PAST });
    await ops().changeStoreStatus(other.storeId, "active", { allowedFrom: ["onboarding"] });
    const active = await ops().getStore(other.storeId);
    expect(active.status).toBe("active");
    expect(active.monthTier).toMatchObject({ orderCount: 0 });

    await ops().changeStoreStatus(other.storeId, "suspended", {
      allowedFrom: ["active", "onboarding"],
      reason: "inadimplência",
    });
    const suspended = (await ops().storeAudit(other.storeId)).find(
      (entry) =>
        entry.action === "store.status_changed" &&
        (entry.after as { status?: string } | null)?.status === "suspended",
    );
    expect(suspended).toBeDefined();
    expect(suspended!.before).toMatchObject({ status: "active" });
    expect(suspended!.after).toMatchObject({ status: "suspended" });

    await expect(
      ops().changeStoreStatus(other.storeId, "suspended", { allowedFrom: ["active"] }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("Plano novo encerra o anterior; Plano a partir de data já ocupada = conflict", async () => {
    const { storeId } = await newStore();
    const first = await ops().setStorePlan(storeId, { cycle: "monthly", validFrom: PAST });
    const second = await ops().setStorePlan(storeId, {
      cycle: "annual",
      validFrom: "2026-06-01T00:00:00.000Z",
    });
    const detail = await ops().getStore(storeId);
    expect(detail.plan).toMatchObject({ id: second.planId, cycle: "annual" });
    expect(detail.planHistory.find((plan) => plan.id === first.planId)?.validTo).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    await expect(
      ops().setStorePlan(storeId, { cycle: "monthly", validFrom: "2026-03-01T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "conflict" });

    const planSet = (await ops().storeAudit(storeId)).find(
      (entry) => entry.action === "store.plan_set" && entry.targetId === second.planId,
    );
    expect(planSet!.before).toMatchObject({ id: first.planId, validTo: null });
    expect(planSet!.after).toMatchObject({ id: second.planId, cycle: "annual" });
  });
});

describe("taxa Foode com vigência", () => {
  it("sobreposição com taxa gravada = conflict e nenhuma das novas entra", async () => {
    const { storeId } = await newStore();
    await ops().createPaymentFees(storeId, [
      {
        method: "pix",
        cardMode: null,
        percentBps: 99,
        fixedCents: 0,
        validFrom: PAST,
        validTo: null,
      },
    ]);
    await expect(
      ops().createPaymentFees(storeId, [
        {
          method: "credit",
          cardMode: "normal",
          percentBps: 399,
          fixedCents: 0,
          validFrom: PAST,
          validTo: null,
        },
        {
          method: "pix",
          cardMode: null,
          percentBps: 89,
          fixedCents: 0,
          validFrom: "2027-01-01T00:00:00.000Z",
          validTo: null,
        },
      ]),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await feeCount(storeId)).toBe(1);
  });

  it("taxa futura não vale hoje; encerrar a vigente abre espaço sem reescrever", async () => {
    const { storeId } = await newStore();
    const { feeIds } = await ops().createPaymentFees(storeId, [
      {
        method: "pix",
        cardMode: null,
        percentBps: 99,
        fixedCents: 0,
        validFrom: PAST,
        validTo: null,
      },
    ]);
    await ops().endPaymentFee(feeIds[0]!, "2099-01-01T00:00:00.000Z");
    await ops().createPaymentFees(storeId, [
      {
        method: "pix",
        cardMode: null,
        percentBps: 79,
        fixedCents: 10,
        validFrom: "2099-01-01T00:00:00.000Z",
        validTo: null,
      },
    ]);
    const today = await ops().effectivePaymentFees(storeId);
    expect(today).toEqual([expect.objectContaining({ percentBps: 99, source: "store" })]);
    const later = await ops().effectivePaymentFees(storeId, "2099-02-01T00:00:00.000Z");
    expect(later).toEqual([expect.objectContaining({ percentBps: 79, fixedCents: 10 })]);

    // Só encurta: estender ou encerrar antes do início = conflict.
    await expect(ops().endPaymentFee(feeIds[0]!, "2100-01-01T00:00:00.000Z")).rejects.toMatchObject(
      { code: "conflict" },
    );
    const trail = await ops().storeAudit(storeId);
    expect(trail.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["payment_fee.created", "payment_fee.ended"]),
    );
    const ended = trail.find((entry) => entry.action === "payment_fee.ended");
    expect(ended!.before).toMatchObject({ validTo: null });
    expect(ended!.after).toMatchObject({ validTo: "2099-01-01T00:00:00.000Z" });
  });

  it("override da Loja vence o padrão e não vaza para outra Loja; Crédito segue o modo", async () => {
    const a = await newStore("taxa-a");
    const b = await newStore("taxa-b");
    // Padrão numa janela própria deste teste (2090).
    const at = "2090-06-01T00:00:00.000Z";
    await ops().createPaymentFees(null, [
      {
        method: "pix",
        cardMode: null,
        percentBps: 120,
        fixedCents: 0,
        validFrom: "2090-01-01T00:00:00.000Z",
        validTo: "2091-01-01T00:00:00.000Z",
      },
      {
        method: "credit",
        cardMode: "rapido",
        percentBps: 590,
        fixedCents: 0,
        validFrom: "2090-01-01T00:00:00.000Z",
        validTo: "2091-01-01T00:00:00.000Z",
      },
    ]);
    await ops().createPaymentFees(a.storeId, [
      {
        method: "pix",
        cardMode: null,
        percentBps: 50,
        fixedCents: 0,
        validFrom: "2090-01-01T00:00:00.000Z",
        validTo: null,
      },
    ]);
    await ops().setCardMode(a.storeId, "rapido");

    expect(await ops().effectivePaymentFees(a.storeId, at)).toEqual([
      expect.objectContaining({ method: "pix", percentBps: 50, source: "store" }),
      expect.objectContaining({ method: "credit", cardMode: "rapido", source: "default" }),
    ]);
    // B: sem modo do cartão = sem Crédito; PIX do padrão.
    expect(await ops().effectivePaymentFees(b.storeId, at)).toEqual([
      expect.objectContaining({ method: "pix", percentBps: 120, source: "default" }),
    ]);
    expect(await ops().listPaymentFees(b.storeId)).toEqual([]);
    expect(await actions(b.storeId)).toEqual(["store.created"]);

    // Checkout só enxerga Loja active.
    await expect(db.checkout.effectivePaymentFees(a.storeId, at)).resolves.toEqual([]);
  });
});

describe("faixas e custos", () => {
  it("publicar faixas encerra a vigente e audita a tabela anterior", async () => {
    const validFrom = "2080-01-01T00:00:00.000Z";
    await ops().publishPlanTiers({
      validFrom,
      monthlyTiers: [
        { minOrders: 0, maxOrders: 100, priceCents: 9000 },
        { minOrders: 101, maxOrders: null, priceCents: 19000 },
      ],
      annualPriceCents: 108000,
    });
    const tables = await ops().listPlanTierTables();
    expect(tables[0]).toMatchObject({ validFrom, validTo: null, annual: { priceCents: 108000 } });
    expect(tables[0]!.monthlyTiers).toHaveLength(2);
    expect(tables.find((table) => table.validFrom < validFrom)?.validTo).toBe(validFrom);

    await expect(
      ops().publishPlanTiers({
        validFrom: "2079-01-01T00:00:00.000Z",
        monthlyTiers: [{ minOrders: 0, maxOrders: null, priceCents: 1 }],
        annualPriceCents: 1,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("custo sobreposto ao semeado = conflict; encerrar e cadastrar o novo funciona", async () => {
    const seeded = (await ops().listProviderCosts()).find(
      (cost) =>
        cost.provider === "efi" && cost.operation === "card_charge" && cost.validTo === null,
    );
    expect(seeded).toBeDefined();
    const entry = {
      provider: "efi" as const,
      operation: "card_charge" as const,
      percentBps: 359,
      fixedCents: 0,
      validFrom: "2070-01-01T00:00:00.000Z",
      validTo: null,
    };
    await expect(ops().createProviderCost(entry)).rejects.toMatchObject({ code: "conflict" });
    await ops().endProviderCost(seeded!.id, entry.validFrom);
    const { costId } = await ops().createProviderCost(entry);
    const costs = await ops().listProviderCosts();
    expect(costs.find((cost) => cost.id === costId)).toMatchObject({ percentBps: 359 });
    expect(costs.find((cost) => cost.id === seeded!.id)?.percentBps).toBe(seeded!.percentBps);
  });
});
