// Teste de vazamento entre Lojas (ADR 0006): sem RLS no D1, o isolamento é invariante
// do código de @foode/db. Roda só no CI (vitest.workers.config.ts).
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { type StoreContext } from "./context";
import { createFoodeDb, type FoodeDb, FoodeDbError, ForgedContextError } from "./index";
import { seedTwoStores, type TwoStoresFixture } from "./testing";

let db: FoodeDb;
let fx: TwoStoresFixture;

async function contextOf(userId: string, storeId: string): Promise<StoreContext> {
  const context = await db.access.storeContext({ userId, storeId });
  if (!context) throw new Error("membership esperada na fixture");
  return context;
}

beforeEach(async () => {
  db = createFoodeDb(env.DB);
  fx = await seedTwoStores(env.DB);
});

describe("isolamento entre Lojas", () => {
  it("não emite contexto da Loja B para o Dono da Loja A", async () => {
    await expect(
      db.access.storeContext({ userId: fx.ownerA.id, storeId: fx.storeB.id }),
    ).resolves.toBeNull();
  });

  it("leitura cruzada: membros e auditoria da Loja A não trazem nada da Loja B", async () => {
    const store = db.store(await contextOf(fx.ownerA.id, fx.storeA.id));

    const members = await store.members();
    expect(members.map((member) => member.membershipId).sort()).toEqual(
      [fx.memberships.ownerA.id, fx.memberships.operatorA.id, fx.memberships.multiA.id].sort(),
    );
    expect(members.some((member) => member.userId === fx.ownerB.id)).toBe(false);

    const trail = await store.auditTrail();
    expect(trail.some((event) => event.id === fx.auditB.id)).toBe(false);
    expect((await store.get()).id).toBe(fx.storeA.id);
  });

  it("id adivinhado: evento de auditoria da Loja B não é lido pelo contexto da Loja A", async () => {
    const store = db.store(await contextOf(fx.ownerA.id, fx.storeA.id));
    await expect(store.auditEvent(fx.auditB.id)).resolves.toBeNull();
  });

  it("escrita cruzada com id adivinhado não remove membership da Loja B nem audita", async () => {
    const storeA = db.store(await contextOf(fx.ownerA.id, fx.storeA.id));
    await expect(storeA.removeMember(fx.memberships.ownerB.id)).resolves.toBe(false);

    const storeB = db.store(await contextOf(fx.ownerB.id, fx.storeB.id));
    const membersB = await storeB.members();
    expect(membersB.map((member) => member.membershipId)).toContain(fx.memberships.ownerB.id);

    const trailA = await storeA.auditTrail();
    expect(trailA.some((event) => event.action === "membership.removed")).toBe(false);
  });

  it("escrita na própria Loja grava só nela, com auditoria", async () => {
    const storeA = db.store(await contextOf(fx.ownerA.id, fx.storeA.id));
    await storeA.rename("Loja A renomeada");
    await expect(storeA.removeMember(fx.memberships.operatorA.id)).resolves.toBe(true);

    const storeB = db.store(await contextOf(fx.ownerB.id, fx.storeB.id));
    expect((await storeB.get()).name).toBe("Loja B");
    expect((await storeA.get()).name).toBe("Loja A renomeada");

    const actions = (await storeA.auditTrail()).map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["store.renamed", "membership.removed"]));
    expect((await storeB.auditTrail()).map((event) => event.action)).toEqual([fx.auditB.action]);
  });

  it("usuário multi-Loja recebe o papel certo em cada Loja", async () => {
    const inA = await contextOf(fx.multi.id, fx.storeA.id);
    const inB = await contextOf(fx.multi.id, fx.storeB.id);
    expect(inA.role).toBe("owner");
    expect(inB.role).toBe("operator");

    const storesOfMulti = await db.access.storesOfUser(fx.multi.id);
    expect(storesOfMulti.map((store) => store.id).sort()).toEqual(
      [fx.storeA.id, fx.storeB.id].sort(),
    );

    // Operador na Loja B não escreve; Dono na Loja A não alcança B pelo contexto de A.
    await expect(db.store(inB).rename("x")).rejects.toBeInstanceOf(FoodeDbError);
    await expect(db.store(inA).removeMember(fx.memberships.ownerB.id)).resolves.toBe(false);
  });

  it("contexto falsificado (literal com storeId de outra Loja) é recusado em runtime", async () => {
    const forged = {
      storeId: fx.storeB.id,
      userId: fx.ownerA.id,
      role: "owner",
    } as unknown as StoreContext;
    expect(() => db.store(forged)).toThrow(ForgedContextError);

    const real = await contextOf(fx.ownerA.id, fx.storeA.id);
    const spread = { ...real, storeId: fx.storeB.id } as StoreContext;
    expect(() => db.store(spread)).toThrow(ForgedContextError);
  });
});

describe("Storefront público", () => {
  it("só enxerga Lojas active", async () => {
    await expect(db.storefront.publicStoreBySlug(fx.storeA.slug)).resolves.toEqual({
      slug: fx.storeA.slug,
      name: fx.storeA.name,
    });

    const opsContext = await db.access.opsContext(fx.ops.id);
    if (!opsContext) throw new Error("ops esperado na fixture");
    await db
      .ops(opsContext)
      .changeStoreStatus(fx.storeA.id, "suspended", { allowedFrom: ["active"], reason: "teste" });
    await expect(db.storefront.publicStoreBySlug(fx.storeA.slug)).resolves.toBeNull();
  });
});

describe("área Ops", () => {
  it("só emite contexto Ops para foode_ops", async () => {
    await expect(db.access.opsContext(fx.ownerA.id)).resolves.toBeNull();
    await expect(db.access.opsContext(fx.ops.id)).resolves.not.toBeNull();
  });
});
