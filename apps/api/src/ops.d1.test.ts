// RPCs da área Ops (Ticket 29) no workerd com D1 (só no CI): acesso (Dono/Operador = forbidden,
// sem sessão = unauthenticated, sem efeito), Slug duplicado, ativação sem Plano recusada,
// vigência sobreposta, auditoria before/after e isolamento entre Lojas. Better Auth real; o
// siteverify do captcha do login é interceptado no `fetch` global.
import { env } from "cloudflare:test";
import { createFoodeDb, type FoodeDb, type OpsContext } from "@foode/db";
import { seedTwoStores, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth, type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import { createOpsService, type OpsService } from "./ops-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";
const PAST = "2026-01-01T00:00:00.000Z";

let fx: TwoStoresFixture;
let db: FoodeDb;
let auth: FoodeAuth;
let service: OpsService;
let opsCtx: OpsContext;
const pending: Promise<unknown>[] = [];
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
  const reset = await auth.handler(
    authRequest("/reset-password", { token, newPassword: PASSWORD }),
  );
  expect(reset.status).toBe(200);
  const response = await auth.handler(
    authRequest("/sign-in/email", { email: user.email, password: PASSWORD }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { cookie, ip: randomIp() };
}

/** Entrada crua como o admin manda (máscaras incluídas); o Zod normaliza. */
function createInput(slug: string) {
  return {
    slug,
    name: "Loja do Ops",
    cnpj: "11.222.333/0001-81",
    whatsapp: "(11) 98765-4321",
    address: {
      postalCode: "01310-100",
      street: "Avenida Paulista",
      number: "1000",
      complement: null,
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
    payout: {
      pixKey: { type: "cpf", value: "529.982.247-25" },
      holderName: "Titular do Repasse",
      holderDocument: "529.982.247-25",
    },
  };
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function createStore(caller: PainelCaller, prefix = "ops"): Promise<string> {
  const result = await service.opsCreateStore(caller, createInput(uniqueSlug(prefix)));
  if (!result.ok) throw new Error(`createStore: ${result.error}`);
  return result.data.storeId;
}

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
  db = createFoodeDb(env.DB);
  const waitUntil = (promise: Promise<unknown>) => {
    pending.push(promise);
  };
  auth = createAuth(env, { email: { send: async () => ({ id: "email" }) }, waitUntil });
  service = createOpsService({ db, auth });
  const context = await db.access.opsContext(fx.ops.id);
  if (!context) throw new Error("ops esperado na fixture");
  opsCtx = context;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === TURNSTILE_SITEVERIFY_URL) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { response?: string };
      return Response.json({ success: body.response === CAPTCHA_OK });
    }
    return realFetch(input, init);
  });
});

afterEach(async () => {
  while (pending.length) await pending.shift();
  vi.restoreAllMocks();
});

describe("acesso às RPCs Ops", () => {
  it("sem sessão = unauthenticated; Dono e Operador = forbidden; nada é gravado", async () => {
    const anon: PainelCaller = { cookie: "", ip: randomIp() };
    await expect(service.opsListStores(anon)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });

    for (const user of [fx.ownerA, fx.operatorA]) {
      const caller = await loginAs(user);
      await expect(service.opsListStores(caller)).resolves.toEqual({
        ok: false,
        error: "forbidden",
      });
      await expect(
        service.opsCreateStore(caller, createInput(uniqueSlug("intrusa"))),
      ).resolves.toEqual({ ok: false, error: "forbidden" });
      await expect(
        service.opsSuspendStore(caller, { storeId: fx.storeA.id, reason: "tentativa" }),
      ).resolves.toEqual({ ok: false, error: "forbidden" });
      await expect(
        service.opsCreatePaymentFees(caller, {
          storeId: fx.storeA.id,
          fees: [{ method: "pix", percentBps: 1, validFrom: PAST }],
        }),
      ).resolves.toEqual({ ok: false, error: "forbidden" });
    }

    const audit = await db.ops(opsCtx).storeAudit(fx.storeA.id);
    expect(audit.map((entry) => entry.action)).not.toContain("store.status_changed");
    expect((await db.ops(opsCtx).getStore(fx.storeA.id)).status).toBe("active");
    await expect(db.ops(opsCtx).listPaymentFees(fx.storeA.id)).resolves.toEqual([]);
  });
});

describe("Lojas pelo Ops", () => {
  it("cadastra em onboarding (entrada normalizada) e lista com checklist", async () => {
    const ops = await loginAs(fx.ops);
    const storeId = await createStore(ops);

    const detail = await service.opsGetStore(ops, { storeId });
    expect(detail.ok && detail.data).toMatchObject({
      status: "onboarding",
      cnpj: "11222333000181",
      whatsapp: "5511987654321",
      address: { postalCode: "01310100", state: "SP" },
      payout: { pixKeyType: "cpf", pixKey: "52998224725" },
      owners: [],
      plan: null,
      monthTier: null,
    });

    const list = await service.opsListStores(ops);
    expect(list.ok).toBe(true);
    const item = list.ok ? list.data.find((store) => store.id === storeId) : undefined;
    expect(item?.onboarding).toEqual(
      expect.arrayContaining([
        { check: "profile", done: true },
        { check: "payout", done: true },
        { check: "owner_invited", done: false },
        { check: "plan", done: false },
      ]),
    );
  });

  it("Slug duplicado ou reservado: conflict / invalid_input, sem gravar", async () => {
    const ops = await loginAs(fx.ops);
    await expect(service.opsCreateStore(ops, createInput(fx.storeA.slug))).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    await expect(service.opsCreateStore(ops, createInput("admin"))).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    await expect(
      service.opsUpdateStore(ops, { storeId: fx.storeB.id, slug: fx.storeA.slug }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
    const audit = await db.ops(opsCtx).storeAudit(fx.storeB.id);
    expect(audit.map((entry) => entry.action)).not.toContain("store.updated");
  });

  it("ativar sem Plano vigente = conflict; com Plano e Dono convidado ativa; suspender audita o motivo", async () => {
    const ops = await loginAs(fx.ops);
    const storeId = await createStore(ops);
    await db.ops(opsCtx).inviteOwner(storeId, { email: `dono-${crypto.randomUUID()}@loja.test` });

    await expect(service.opsActivateStore(ops, { storeId })).resolves.toEqual({
      ok: false,
      error: "conflict",
    });

    await expect(
      service.opsSetStorePlan(ops, { storeId, cycle: "monthly", validFrom: PAST }),
    ).resolves.toMatchObject({ ok: true });
    await expect(service.opsActivateStore(ops, { storeId })).resolves.toEqual({
      ok: true,
      data: null,
    });
    // active → active não é transição válida.
    await expect(service.opsActivateStore(ops, { storeId })).resolves.toEqual({
      ok: false,
      error: "conflict",
    });

    await expect(
      service.opsSuspendStore(ops, { storeId, reason: "Plano em atraso" }),
    ).resolves.toEqual({ ok: true, data: null });

    const audit = await service.opsListStoreAudit(ops, { storeId });
    expect(audit.ok).toBe(true);
    const entries = audit.ok ? audit.data : [];
    const suspended = entries.find(
      (entry) =>
        entry.action === "store.status_changed" &&
        (entry.after as { status?: string }).status === "suspended",
    );
    expect(suspended).toMatchObject({ actorUserId: fx.ops.id, actorEmail: fx.ops.email });
    expect(suspended?.before).toMatchObject({ status: "active" });
    expect(entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["store.created", "store.plan_set", "store.status_changed"]),
    );
  });

  it("modo do cartão e edição: só os campos enviados, com before/after", async () => {
    const ops = await loginAs(fx.ops);
    const storeId = await createStore(ops);
    await expect(service.opsSetCardMode(ops, { storeId, cardMode: "rapido" })).resolves.toEqual({
      ok: true,
      data: null,
    });
    await expect(service.opsUpdateStore(ops, { storeId, name: "Nome Novo" })).resolves.toEqual({
      ok: true,
      data: null,
    });
    const detail = await service.opsGetStore(ops, { storeId });
    expect(detail.ok && detail.data).toMatchObject({
      name: "Nome Novo",
      cardMode: "rapido",
      cnpj: "11222333000181",
    });
    const audit = await service.opsListStoreAudit(ops, { storeId });
    const cardMode = audit.ok
      ? audit.data.find((entry) => entry.action === "store.card_mode_set")
      : undefined;
    expect(cardMode?.before).toMatchObject({ profile: { cardMode: null } });
    expect(cardMode?.after).toMatchObject({ profile: { cardMode: "rapido" } });
  });
});

describe("taxas, faixas e custos pelo Ops", () => {
  it("vigência sobreposta com o gravado = conflict; taxa futura não vale hoje", async () => {
    const ops = await loginAs(fx.ops);
    const storeId = await createStore(ops);
    const first = await service.opsCreatePaymentFees(ops, {
      storeId,
      fees: [{ method: "pix", percentBps: 99, validFrom: PAST, validTo: "2099-01-01T00:00:00Z" }],
    });
    expect(first.ok).toBe(true);

    await expect(
      service.opsCreatePaymentFees(ops, {
        storeId,
        fees: [{ method: "pix", percentBps: 79, validFrom: "2098-01-01T00:00:00Z" }],
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });

    await expect(
      service.opsCreatePaymentFees(ops, {
        storeId,
        fees: [{ method: "pix", percentBps: 79, validFrom: "2099-01-01T00:00:00Z" }],
      }),
    ).resolves.toMatchObject({ ok: true });

    const today = await db.ops(opsCtx).effectivePaymentFees(storeId);
    expect(today).toEqual([expect.objectContaining({ percentBps: 99, source: "store" })]);

    const list = await service.opsListPaymentFees(ops, { storeId });
    expect(list.ok && list.data.map((fee) => fee.percentBps).sort()).toEqual([79, 99]);
    const audit = await service.opsListStoreAudit(ops, { storeId });
    expect(
      audit.ok && audit.data.filter((entry) => entry.action === "payment_fee.created"),
    ).toHaveLength(2);
  });

  it("override de uma Loja não aparece em outra; Loja inexistente = not_found", async () => {
    const ops = await loginAs(fx.ops);
    await expect(
      service.opsCreatePaymentFees(ops, {
        storeId: fx.storeA.id,
        fees: [{ method: "credit", cardMode: "normal", percentBps: 399, validFrom: PAST }],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(service.opsListPaymentFees(ops, { storeId: fx.storeB.id })).resolves.toEqual({
      ok: true,
      data: [],
    });
    const auditB = await db.ops(opsCtx).storeAudit(fx.storeB.id);
    expect(auditB.map((entry) => entry.action)).not.toContain("payment_fee.created");

    await expect(
      service.opsCreatePaymentFees(ops, {
        storeId: crypto.randomUUID(),
        fees: [{ method: "pix", percentBps: 1, validFrom: PAST }],
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
  });

  it("faixas semeadas (decisão 61) e custo sobreposto = conflict", async () => {
    const ops = await loginAs(fx.ops);
    const tiers = await service.opsListPlanTiers(ops);
    expect(tiers.ok && tiers.data.at(-1)).toMatchObject({
      validFrom: "2026-11-01T00:00:00.000Z",
      annual: { priceCents: 101988 },
    });

    await expect(
      service.opsCreateProviderCost(ops, {
        provider: "abacatepay",
        operation: "pix_charge",
        percentBps: 0,
        fixedCents: 60,
        validFrom: "2060-01-01T00:00:00Z",
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
  });
});
