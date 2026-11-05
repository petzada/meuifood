// Fixture "app com duas Lojas" para testes com D1 (vitest-plugin, só no CI).
// Grava direto pelo Drizzle porque é setup de teste; o código de produção passa por
// createFoodeDb. Só testes importam `@foode/db/testing` (regra de lint).
import { drizzle } from "drizzle-orm/d1";

import { newId } from "../conventions";
import { auditEvents, storeMemberships, stores, users } from "../schema";

export type TwoStoresFixture = Awaited<ReturnType<typeof seedTwoStores>>;

export async function seedTwoStores(d1: D1Database) {
  const db = drizzle(d1);
  const suffix = newId().slice(0, 8);

  const storeA = {
    id: newId(),
    slug: `loja-a-${suffix}`,
    name: "Loja A",
    status: "active" as const,
  };
  const storeB = {
    id: newId(),
    slug: `loja-b-${suffix}`,
    name: "Loja B",
    status: "active" as const,
  };
  const ownerA = { id: newId(), email: `dono-a-${suffix}@foode.test`, name: "Dono A" };
  const ownerB = { id: newId(), email: `dono-b-${suffix}@foode.test`, name: "Dono B" };
  const operatorA = { id: newId(), email: `operador-a-${suffix}@foode.test`, name: "Operador A" };
  // Mesmo usuário em duas Lojas: Dono de A e Operador de B (multi-Loja).
  const multi = { id: newId(), email: `multi-${suffix}@foode.test`, name: "Multi" };
  const ops = {
    id: newId(),
    email: `ops-${suffix}@foode.test`,
    name: "Ops",
    platformRole: "foode_ops" as const,
  };

  const memberships = {
    ownerA: { id: newId(), storeId: storeA.id, userId: ownerA.id, role: "owner" as const },
    operatorA: { id: newId(), storeId: storeA.id, userId: operatorA.id, role: "operator" as const },
    multiA: { id: newId(), storeId: storeA.id, userId: multi.id, role: "owner" as const },
    ownerB: { id: newId(), storeId: storeB.id, userId: ownerB.id, role: "owner" as const },
    multiB: { id: newId(), storeId: storeB.id, userId: multi.id, role: "operator" as const },
  };

  const auditB = {
    id: newId(),
    storeId: storeB.id,
    actorUserId: ownerB.id,
    action: "fixture.segredo_da_loja_b",
  };

  await db.batch([
    db.insert(stores).values([storeA, storeB]),
    db.insert(users).values([ownerA, ownerB, operatorA, multi, ops]),
    db.insert(storeMemberships).values(Object.values(memberships)),
    db.insert(auditEvents).values(auditB),
  ]);

  return { storeA, storeB, ownerA, ownerB, operatorA, multi, ops, memberships, auditB };
}
