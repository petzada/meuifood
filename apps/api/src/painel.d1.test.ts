// Auth multi-Loja e RBAC do Painel no workerd com D1 (só no CI). Better Auth real sobre a
// migration 0001; e-mail e Turnstile das RPCs falsos; o siteverify do plugin captcha é
// interceptado no `fetch` global. Fixture "app com duas Lojas" (@foode/db/testing).
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { createFoodeDb, type FoodeDb, type StoreContext } from "@foode/db";
import { seedTwoStores, type TwoStoresFixture } from "@foode/db/testing";
import type { PainelCaller } from "@foode/shared";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_RATE_LIMIT_RULES,
  createAuth,
  type FoodeAuth,
  INVITE_TOKEN_TTL_SECONDS,
} from "./auth/auth";
import { type GuardVariables, requirePermission, requireRole } from "./auth/guard";
import { TURNSTILE_SITEVERIFY_URL } from "./auth/turnstile";
import type { EmailSender, TransactionalEmail } from "./email/sender";
import type { Env } from "./env";
import { createPainelService, INVITE_RATE_LIMIT, type PainelService } from "./painel-service";

const PANEL = new URL(env.BETTER_AUTH_URL ?? "https://painel.foode.test").origin;
const PASSWORD = "senha-forte-123";
const CAPTCHA_OK = "captcha-ok";

type Harness = {
  db: FoodeDb;
  auth: FoodeAuth;
  service: PainelService;
  emails: TransactionalEmail[];
  flush(): Promise<void>;
};

let fx: TwoStoresFixture;
let t: Harness;
const realFetch = globalThis.fetch;

function harness(): Harness {
  const emails: TransactionalEmail[] = [];
  const pending: Promise<unknown>[] = [];
  const email: EmailSender = {
    async send(message) {
      emails.push(message);
      return { id: `email-${emails.length}` };
    },
  };
  const waitUntil = (promise: Promise<unknown>) => {
    pending.push(promise);
  };
  const auth = createAuth(env, { email, waitUntil });
  const db = createFoodeDb(env.DB);
  const service = createPainelService({
    db,
    auth,
    email,
    waitUntil,
    turnstile: { verify: async (token) => token === CAPTCHA_OK },
    panelUrl: PANEL,
  });
  return {
    db,
    auth,
    service,
    emails,
    async flush() {
      while (pending.length) await pending.shift();
    },
  };
}

function randomIp(): string {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

function authRequest(
  path: string,
  body: unknown,
  options: { ip?: string | undefined; captcha?: string | null } = {},
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    origin: PANEL,
    "cf-connecting-ip": options.ip ?? randomIp(),
  });
  const captcha = options.captcha === undefined ? CAPTCHA_OK : options.captcha;
  if (captcha !== null) headers.set("x-captcha-response", captcha);
  return new Request(`${PANEL}/api/auth${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function setPassword(userId: string, password = PASSWORD): Promise<void> {
  const token = await t.auth.createSetPasswordToken(userId, INVITE_TOKEN_TTL_SECONDS);
  const response = await t.auth.handler(
    authRequest("/reset-password", { token, newPassword: password }),
  );
  expect(response.status).toBe(200);
}

function signIn(email: string, password = PASSWORD, ip?: string): Promise<Response> {
  return t.auth.handler(authRequest("/sign-in/email", { email, password }, { ip }));
}

async function loginAs(user: { id: string; email: string }): Promise<PainelCaller> {
  await setPassword(user.id);
  const response = await signIn(user.email);
  expect(response.status).toBe(200);
  const cookie = cookieOf(response);
  expect(cookie).toContain("session_token=");
  return { cookie, ip: randomIp() };
}

async function storeCtx(userId: string, storeId: string): Promise<StoreContext> {
  const context = await t.db.access.storeContext({ userId, storeId });
  if (!context) throw new Error("fixture sem membership");
  return context;
}

async function membersOf(storeId: string, ownerId: string) {
  return t.db.store(await storeCtx(ownerId, storeId)).members();
}

async function auditActions(storeId: string, ownerId: string): Promise<string[]> {
  const trail = await t.db.store(await storeCtx(ownerId, storeId)).auditTrail(200);
  return trail.map((event) => event.action);
}

function tokenFromEmail(email: TransactionalEmail): string {
  const match = /token=([A-Za-z0-9]+)/.exec(email.text);
  if (!match?.[1]) throw new Error("e-mail sem token");
  return match[1];
}

beforeEach(async () => {
  fx = await seedTwoStores(env.DB);
  t = harness();
  // Siteverify do plugin captcha: aprova só o token CAPTCHA_OK. Nada sai para a rede.
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
  await t.flush();
  vi.restoreAllMocks();
});

describe("login (Better Auth no D1)", () => {
  it("entra com e-mail e senha; cookie httpOnly, Secure e SameSite=Lax", async () => {
    await setPassword(fx.ownerA.id);
    const response = await signIn(fx.ownerA.email);
    expect(response.status).toBe(200);
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/^__Secure-/);
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/Secure/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });

  it("senha errada, usuário sem senha e e-mail inexistente: 401 sem sessão", async () => {
    await setPassword(fx.ownerA.id);
    for (const [email, password] of [
      [fx.ownerA.email, "senha-errada-1"],
      [fx.ownerB.email, PASSWORD],
      ["ninguem@foode.test", PASSWORD],
    ] as const) {
      const response = await signIn(email, password);
      expect(response.status, email).toBe(401);
      expect(cookieOf(response)).not.toContain("session_token=");
    }
  });

  it("sem cadastro aberto: /sign-up/email é recusado", async () => {
    const response = await t.auth.handler(
      authRequest("/sign-up/email", { email: "novo@foode.test", password: PASSWORD, name: "X" }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    await expect(signIn("novo@foode.test")).resolves.toHaveProperty("status", 401);
  });

  it("Turnstile: sem token 400, token recusado 403, sem sessão", async () => {
    await setPassword(fx.ownerA.id);
    const body = { email: fx.ownerA.email, password: PASSWORD };
    const missing = await t.auth.handler(authRequest("/sign-in/email", body, { captcha: null }));
    expect(missing.status).toBe(400);
    const rejected = await t.auth.handler(authRequest("/sign-in/email", body, { captcha: "bot" }));
    expect(rejected.status).toBe(403);
    expect(cookieOf(rejected)).not.toContain("session_token=");
  });

  it("rate limit por IP (cf-connecting-ip) no login: 429 depois do limite", async () => {
    const ip = randomIp();
    const { max } = AUTH_RATE_LIMIT_RULES["/sign-in/email"];
    for (let attempt = 0; attempt < max; attempt += 1) {
      const response = await signIn(fx.ownerA.email, "senha-errada-1", ip);
      expect(response.status).toBe(401);
    }
    expect((await signIn(fx.ownerA.email, "senha-errada-1", ip)).status).toBe(429);
    // Outro IP não herda o bloqueio.
    expect((await signIn(fx.ownerA.email, "senha-errada-1", randomIp())).status).toBe(401);
  });
});

describe("definir senha e reset (token de uso único)", () => {
  it("convite: prazo de 72 h, uso único, cria a conta credential", async () => {
    const owner = await loginAs(fx.ownerA);
    const spy = vi.spyOn(t.auth, "createSetPasswordToken");
    const invited = await t.service.inviteMember(owner, {
      email: "Novo.Operador@Loja.test",
      role: "operator",
      turnstileToken: CAPTCHA_OK,
    });
    expect(invited.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.any(String), INVITE_TOKEN_TTL_SECONDS);
    expect(INVITE_TOKEN_TTL_SECONDS).toBe(72 * 60 * 60);
    await t.flush();

    const email = t.emails.at(-1)!;
    expect(email.to).toBe("novo.operador@loja.test");
    expect(email.text).toContain(`${PANEL}/definir-senha?token=`);
    expect(email.text).toContain("fluxo=convite");
    const token = tokenFromEmail(email);

    const set = await t.auth.handler(
      authRequest("/reset-password", { token, newPassword: PASSWORD }),
    );
    expect(set.status).toBe(200);
    const reused = await t.auth.handler(
      authRequest("/reset-password", { token, newPassword: "outra-senha-456" }),
    );
    expect(reused.status).toBe(400);

    const login = await signIn("novo.operador@loja.test");
    expect(login.status).toBe(200);
    const session = await t.service.session({ cookie: cookieOf(login), ip: null });
    expect(session?.activeStore).toMatchObject({ id: fx.storeA.id, role: "operator" });
    expect(session?.stores.map((store) => store.id)).toEqual([fx.storeA.id]);
  });

  it("token expirado não define senha", async () => {
    const token = await t.auth.createSetPasswordToken(fx.ownerB.id, -1);
    const response = await t.auth.handler(
      authRequest("/reset-password", { token, newPassword: PASSWORD }),
    );
    expect(response.status).toBe(400);
    expect((await signIn(fx.ownerB.email)).status).toBe(401);
  });

  it("reset pelo e-mail funciona para quem nunca definiu senha e exige Turnstile", async () => {
    const noCaptcha = await t.auth.handler(
      authRequest("/request-password-reset", { email: fx.ownerB.email }, { captcha: null }),
    );
    expect(noCaptcha.status).toBe(400);

    const requested = await t.auth.handler(
      authRequest("/request-password-reset", { email: fx.ownerB.email }),
    );
    expect(requested.status).toBe(200);
    await t.flush();
    const email = t.emails.at(-1)!;
    expect(email.to).toBe(fx.ownerB.email);
    expect(email.text).toContain("fluxo=reset");

    const token = tokenFromEmail(email);
    const noCaptchaReset = await t.auth.handler(
      authRequest("/reset-password", { token, newPassword: PASSWORD }, { captcha: null }),
    );
    expect(noCaptchaReset.status).toBe(400);
    const reset = await t.auth.handler(
      authRequest("/reset-password", { token, newPassword: PASSWORD }),
    );
    expect(reset.status).toBe(200);
    expect((await signIn(fx.ownerB.email)).status).toBe(200);
  });

  it("reset de e-mail inexistente responde igual e não envia nada", async () => {
    const response = await t.auth.handler(
      authRequest("/request-password-reset", { email: "ninguem@foode.test" }),
    );
    expect(response.status).toBe(200);
    await t.flush();
    expect(t.emails).toHaveLength(0);
  });
});

describe("sessão e Loja ativa", () => {
  it("sem cookie ou cookie inválido: null / unauthenticated", async () => {
    await expect(t.service.session({ cookie: "", ip: null })).resolves.toBeNull();
    await expect(
      t.service.session({ cookie: "__Secure-better-auth.session_token=forjado", ip: null }),
    ).resolves.toBeNull();
    await expect(t.service.listMembers({ cookie: "", ip: null })).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it("Dono de uma Loja: ela é a ativa; Ops sem Loja tem platformRole", async () => {
    const owner = await t.service.session(await loginAs(fx.ownerA));
    expect(owner?.user).toMatchObject({ id: fx.ownerA.id, platformRole: null });
    expect(owner?.activeStore).toMatchObject({ id: fx.storeA.id, role: "owner" });

    const ops = await t.service.session(await loginAs(fx.ops));
    expect(ops?.user.platformRole).toBe("foode_ops");
    expect(ops?.activeStore).toBeNull();
    expect(ops?.stores).toEqual([]);
  });

  it("usuário com duas Lojas escolhe a ativa; papel e dados seguem a Loja escolhida", async () => {
    const multi = await loginAs(fx.multi);
    const initial = await t.service.session(multi);
    expect(initial?.activeStore).toBeNull();
    expect(initial?.stores.map((store) => store.id).sort()).toEqual(
      [fx.storeA.id, fx.storeB.id].sort(),
    );
    await expect(t.service.listMembers(multi)).resolves.toEqual({ ok: false, error: "forbidden" });

    // Loja A: Dono → vê só membros de A.
    const toA = await t.service.switchActiveStore(multi, { storeId: fx.storeA.id });
    expect(toA).toMatchObject({ ok: true, data: { id: fx.storeA.id, role: "owner" } });
    const membersA = await t.service.listMembers(multi);
    expect(membersA.ok).toBe(true);
    const idsA = membersA.ok ? membersA.data.map((member) => member.membershipId) : [];
    expect(idsA).toContain(fx.memberships.ownerA.id);
    expect(idsA).not.toContain(fx.memberships.ownerB.id);

    // Loja B: Operador → sem acesso a membros; nada de A vaza.
    const toB = await t.service.switchActiveStore(multi, { storeId: fx.storeB.id });
    expect(toB).toMatchObject({ ok: true, data: { id: fx.storeB.id, role: "operator" } });
    await expect(t.service.listMembers(multi)).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(
      t.service.removeMember(multi, { membershipId: fx.memberships.operatorA.id }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect((await membersOf(fx.storeA.id, fx.ownerA.id)).map((m) => m.membershipId)).toContain(
      fx.memberships.operatorA.id,
    );
  });

  it("troca para Loja sem membership: forbidden e a Loja ativa não muda", async () => {
    const owner = await loginAs(fx.ownerA);
    await expect(t.service.switchActiveStore(owner, { storeId: fx.storeB.id })).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    await expect(t.service.switchActiveStore(owner, { storeId: "1 OR 1=1" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    const session = await t.service.session(owner);
    expect(session?.activeStore?.id).toBe(fx.storeA.id);
    const membersB = await membersOf(fx.storeB.id, fx.ownerB.id);
    expect(membersB.map((member) => member.userId)).not.toContain(fx.ownerA.id);
  });
});

describe("RBAC: negação sem efeito persistido", () => {
  it("Operador não lista, não convida e não remove", async () => {
    const operator = await loginAs(fx.operatorA);
    const before = await membersOf(fx.storeA.id, fx.ownerA.id);
    const auditBefore = await auditActions(fx.storeA.id, fx.ownerA.id);

    await expect(t.service.listMembers(operator)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    await expect(
      t.service.inviteMember(operator, {
        email: "intruso@foode.test",
        role: "owner",
        turnstileToken: CAPTCHA_OK,
      }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(
      t.service.removeMember(operator, { membershipId: fx.memberships.ownerA.id }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(
      t.service.opsInviteOwner(operator, {
        storeId: fx.storeA.id,
        email: "intruso@foode.test",
        turnstileToken: CAPTCHA_OK,
      }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });

    expect(await membersOf(fx.storeA.id, fx.ownerA.id)).toEqual(before);
    expect(await auditActions(fx.storeA.id, fx.ownerA.id)).toEqual(auditBefore);
    await t.flush();
    expect(t.emails).toHaveLength(0);
  });

  it("Dono não entra na área Ops; Ops não opera Loja", async () => {
    const owner = await loginAs(fx.ownerA);
    await expect(
      t.service.opsInviteOwner(owner, {
        storeId: fx.storeB.id,
        email: "dono-novo@foode.test",
        turnstileToken: CAPTCHA_OK,
      }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });

    const ops = await loginAs(fx.ops);
    await expect(t.service.listMembers(ops)).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(
      t.service.inviteMember(ops, {
        email: "x@foode.test",
        role: "operator",
        turnstileToken: CAPTCHA_OK,
      }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(t.service.switchActiveStore(ops, { storeId: fx.storeA.id })).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await membersOf(fx.storeB.id, fx.ownerB.id)).map((m) => m.email)).not.toContain(
      "dono-novo@foode.test",
    );
  });

  it("Dono não remove membership de outra Loja (id de B na sessão de A)", async () => {
    const owner = await loginAs(fx.ownerA);
    await expect(
      t.service.removeMember(owner, { membershipId: fx.memberships.ownerB.id }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    expect((await membersOf(fx.storeB.id, fx.ownerB.id)).map((m) => m.membershipId)).toContain(
      fx.memberships.ownerB.id,
    );
    expect(await auditActions(fx.storeB.id, fx.ownerB.id)).not.toContain("membership.removed");
  });

  it("middleware Hono requireRole/requirePermission: 401, 403 e contexto emitido", async () => {
    const app = new Hono<{ Bindings: Env; Variables: GuardVariables }>();
    app.use("*", async (c, next) => {
      c.set("auth", t.auth);
      c.set("db", t.db);
      await next();
    });
    app.get("/ops", requireRole("foode_ops"), (c) => c.json({ kind: c.var.authorized.kind }));
    app.get("/pedidos", requirePermission("orders.update_status"), (c) =>
      c.json({
        storeId: c.var.authorized.kind === "store" ? c.var.authorized.store.storeId : null,
      }),
    );
    const call = (path: string, caller?: PainelCaller) =>
      app.request(path, { headers: caller ? { cookie: caller.cookie } : {} });

    expect((await call("/pedidos")).status).toBe(401);
    const operator = await loginAs(fx.operatorA);
    const orders = await call("/pedidos", operator);
    expect(orders.status).toBe(200);
    await expect(orders.json()).resolves.toEqual({ storeId: fx.storeA.id });
    expect((await call("/ops", operator)).status).toBe(403);

    const ops = await loginAs(fx.ops);
    expect((await call("/ops", ops)).status).toBe(200);
    expect((await call("/pedidos", ops)).status).toBe(403);
  });
});

describe("convite (fluxo único de provisionamento)", () => {
  it("Dono convida: cria usuário e membership na Loja ATIVA, audita e envia o link", async () => {
    const owner = await loginAs(fx.ownerA);
    const result = await t.service.inviteMember(owner, {
      email: "op2@loja.test",
      name: "Operador Dois",
      role: "operator",
      storeId: fx.storeB.id, // ignorado: a Loja vem da sessão
      turnstileToken: CAPTCHA_OK,
    });
    expect(result.ok).toBe(true);
    const membersA = await membersOf(fx.storeA.id, fx.ownerA.id);
    expect(membersA).toContainEqual(
      expect.objectContaining({ email: "op2@loja.test", name: "Operador Dois", role: "operator" }),
    );
    expect((await membersOf(fx.storeB.id, fx.ownerB.id)).map((m) => m.email)).not.toContain(
      "op2@loja.test",
    );
    expect(await auditActions(fx.storeA.id, fx.ownerA.id)).toContain("membership.invited");
    await t.flush();
    expect(t.emails).toHaveLength(1);
    expect(t.emails[0]!.subject).toContain("Loja A");
  });

  it("Turnstile recusado: captcha_failed e nada é gravado", async () => {
    const owner = await loginAs(fx.ownerA);
    const before = await membersOf(fx.storeA.id, fx.ownerA.id);
    await expect(
      t.service.inviteMember(owner, {
        email: "bot@loja.test",
        role: "operator",
        turnstileToken: "bot",
      }),
    ).resolves.toEqual({ ok: false, error: "captcha_failed" });
    expect(await membersOf(fx.storeA.id, fx.ownerA.id)).toEqual(before);
  });

  it("usuário existente com senha ganha a membership e só um aviso; repetir = conflict", async () => {
    await setPassword(fx.ownerB.id);
    const owner = await loginAs(fx.ownerA);
    const first = await t.service.inviteMember(owner, {
      email: fx.ownerB.email,
      role: "operator",
      turnstileToken: CAPTCHA_OK,
    });
    expect(first.ok).toBe(true);
    await t.flush();
    expect(t.emails.at(-1)!.text).not.toContain("token=");
    expect(t.emails.at(-1)!.text).toContain(`${PANEL}/entrar`);

    const again = await t.service.inviteMember(owner, {
      email: fx.ownerB.email,
      role: "owner",
      turnstileToken: CAPTCHA_OK,
    });
    expect(again).toEqual({ ok: false, error: "conflict" });
    const member = (await membersOf(fx.storeA.id, fx.ownerA.id)).find(
      (m) => m.userId === fx.ownerB.id,
    );
    expect(member?.role).toBe("operator");
  });

  it("reconvidar quem ainda não definiu senha reenvia o link (mesma membership)", async () => {
    const owner = await loginAs(fx.ownerA);
    const first = await t.service.inviteMember(owner, {
      email: "pendente@loja.test",
      role: "operator",
      turnstileToken: CAPTCHA_OK,
    });
    const second = await t.service.inviteMember(owner, {
      email: "pendente@loja.test",
      role: "operator",
      turnstileToken: CAPTCHA_OK,
    });
    expect(second).toEqual(first);
    await t.flush();
    expect(t.emails.filter((email) => email.to === "pendente@loja.test")).toHaveLength(2);
    expect(await auditActions(fx.storeA.id, fx.ownerA.id)).toContain("membership.invite_resent");
  });

  it("rate limit de convites por usuário", async () => {
    const owner = await loginAs(fx.ownerA);
    for (let i = 0; i < INVITE_RATE_LIMIT.max; i += 1) {
      const result = await t.service.inviteMember(owner, {
        email: `lote-${i}@loja.test`,
        role: "operator",
        turnstileToken: CAPTCHA_OK,
      });
      expect(result.ok, `convite ${i}`).toBe(true);
    }
    await expect(
      t.service.inviteMember(owner, {
        email: "excedente@loja.test",
        role: "operator",
        turnstileToken: CAPTCHA_OK,
      }),
    ).resolves.toEqual({ ok: false, error: "rate_limited" });
    expect((await membersOf(fx.storeA.id, fx.ownerA.id)).map((m) => m.email)).not.toContain(
      "excedente@loja.test",
    );
  });

  it("Ops convida o Dono de uma Loja; Loja inexistente = not_found", async () => {
    const ops = await loginAs(fx.ops);
    const result = await t.service.opsInviteOwner(ops, {
      storeId: fx.storeB.id,
      email: "socio@loja.test",
      turnstileToken: CAPTCHA_OK,
    });
    expect(result.ok).toBe(true);
    expect(await membersOf(fx.storeB.id, fx.ownerB.id)).toContainEqual(
      expect.objectContaining({ email: "socio@loja.test", role: "owner" }),
    );
    expect(await auditActions(fx.storeB.id, fx.ownerB.id)).toContain(
      "membership.owner_invited_by_ops",
    );

    await expect(
      t.service.opsInviteOwner(ops, {
        storeId: crypto.randomUUID(),
        email: "fantasma@loja.test",
        turnstileToken: CAPTCHA_OK,
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
  });

  it("entrada inválida: invalid_input antes de qualquer efeito", async () => {
    const owner = await loginAs(fx.ownerA);
    for (const input of [
      { email: "x@loja.test", role: "foode_ops", turnstileToken: CAPTCHA_OK },
      { email: "sem-arroba", role: "operator", turnstileToken: CAPTCHA_OK },
      { email: "x@loja.test", role: "operator" },
      null,
    ]) {
      await expect(t.service.inviteMember(owner, input as never)).resolves.toEqual({
        ok: false,
        error: "invalid_input",
      });
    }
  });
});

describe("situação do membro e reenvio do convite (EQP-01)", () => {
  it("listMembers: invited até definir senha, depois active", async () => {
    const owner = await loginAs(fx.ownerA);
    const statusOf = async (userId: string) => {
      const list = await t.service.listMembers(owner);
      if (!list.ok) throw new Error(list.error);
      return list.data.find((member) => member.userId === userId)?.status;
    };
    expect(await statusOf(fx.ownerA.id)).toBe("active");
    expect(await statusOf(fx.operatorA.id)).toBe("invited");
    await setPassword(fx.operatorA.id);
    expect(await statusOf(fx.operatorA.id)).toBe("active");
  });

  it("Dono reenvia: link novo, auditoria e 1 reenvio a cada 5 min por membro", async () => {
    const owner = await loginAs(fx.ownerA);
    const input = { membershipId: fx.memberships.operatorA.id };
    await expect(t.service.resendInvite(owner, input)).resolves.toEqual({
      ok: true,
      data: { membershipId: fx.memberships.operatorA.id },
    });
    await t.flush();
    const sent = t.emails.filter((email) => email.to === fx.operatorA.email);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(`${PANEL}/definir-senha`);
    expect(tokenFromEmail(sent[0]!)).toBeTruthy();
    expect(await auditActions(fx.storeA.id, fx.ownerA.id)).toContain("membership.invite_resent");

    await expect(t.service.resendInvite(owner, input)).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
    await t.flush();
    expect(t.emails.filter((email) => email.to === fx.operatorA.email)).toHaveLength(1);
  });

  it("já ativo = conflict; outra Loja = not_found; Operador = forbidden; sem efeito", async () => {
    const owner = await loginAs(fx.ownerA);
    const operator = await loginAs(fx.operatorA);
    const auditBefore = await auditActions(fx.storeA.id, fx.ownerA.id);

    await expect(
      t.service.resendInvite(owner, { membershipId: fx.memberships.operatorA.id }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
    await expect(
      t.service.resendInvite(owner, { membershipId: fx.memberships.ownerB.id }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(
      t.service.resendInvite(operator, { membershipId: fx.memberships.multiA.id }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(t.service.resendInvite(owner, { membershipId: "x" })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });

    expect(await auditActions(fx.storeA.id, fx.ownerA.id)).toEqual(auditBefore);
    await t.flush();
    expect(t.emails).toHaveLength(0);
  });
});

describe("remover membership", () => {
  it("o acesso cai na request seguinte; sem outra Loja, as sessões são revogadas", async () => {
    const owner = await loginAs(fx.ownerA);
    const operator = await loginAs(fx.operatorA);
    expect((await t.service.session(operator))?.activeStore?.id).toBe(fx.storeA.id);

    await expect(
      t.service.removeMember(owner, { membershipId: fx.memberships.operatorA.id }),
    ).resolves.toEqual({ ok: true, data: null });

    await expect(t.service.session(operator)).resolves.toBeNull();
    await expect(t.service.listMembers(operator)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(await auditActions(fx.storeA.id, fx.ownerA.id)).toContain("membership.removed");
  });

  it("com outra Loja, a sessão continua mas a Loja removida some", async () => {
    const owner = await loginAs(fx.ownerA);
    const multi = await loginAs(fx.multi);
    await t.service.switchActiveStore(multi, { storeId: fx.storeA.id });

    await expect(
      t.service.removeMember(owner, { membershipId: fx.memberships.multiA.id }),
    ).resolves.toEqual({ ok: true, data: null });

    const session = await t.service.session(multi);
    expect(session).not.toBeNull();
    // A Loja ativa removida não cai para outra Loja sozinha.
    expect(session?.activeStore).toBeNull();
    expect(session?.stores.map((store) => store.id)).toEqual([fx.storeB.id]);
    await expect(t.service.listMembers(multi)).resolves.toEqual({ ok: false, error: "forbidden" });
  });

  it("Dono não remove a si mesmo", async () => {
    const owner = await loginAs(fx.ownerA);
    await expect(
      t.service.removeMember(owner, { membershipId: fx.memberships.ownerA.id }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
  });
});

describe("entrypoint PainelApi (binding)", () => {
  it("fetch: só /api/auth/*, e só com cf-connecting-ip", async () => {
    const outside = await exports.PainelApi.fetch(new Request(`${PANEL}/ops/lojas`));
    expect(outside.status).toBe(404);
    const noIp = await exports.PainelApi.fetch(
      new Request(`${PANEL}/api/auth/get-session`, { headers: { origin: PANEL } }),
    );
    expect(noIp.status).toBe(400);
  });

  it("login pelo binding e sessão pela RPC", async () => {
    await setPassword(fx.ownerA.id);
    const login = await exports.PainelApi.fetch(
      authRequest("/sign-in/email", { email: fx.ownerA.email, password: PASSWORD }),
    );
    expect(login.status).toBe(200);
    const session = await exports.PainelApi.session({ cookie: cookieOf(login), ip: null });
    expect(session?.activeStore?.id).toBe(fx.storeA.id);
    await expect(exports.PainelApi.session({ cookie: "", ip: null })).resolves.toBeNull();
  });
});

describe("rate limit no D1 (@foode/db)", () => {
  it("janela fixa atômica por chave", async () => {
    const key = `teste:${crypto.randomUUID()}`;
    const rule = { windowSeconds: 60, max: 2 };
    await expect(t.db.rateLimit.consume(key, rule)).resolves.toBe(true);
    await expect(t.db.rateLimit.consume(key, rule)).resolves.toBe(true);
    await expect(t.db.rateLimit.consume(key, rule)).resolves.toBe(false);
    await expect(t.db.rateLimit.consume(`${key}:outra`, rule)).resolves.toBe(true);
    // Janela zero: toda tentativa reabre a janela.
    await expect(t.db.rateLimit.consume(key, { windowSeconds: 0, max: 1 })).resolves.toBe(true);
  });
});
