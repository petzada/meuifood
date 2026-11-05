// Conta do Consumidor (Ticket 13; decisões 65, 66, 68): login só por código de 4 dígitos no
// WhatsApp, cadastro com nome + CPF no 1º acesso, sessão por cookie no domínio do Storefront (o web
// repassa `cookie`/`set-cookie` pelo binding) e "meus Pedidos" por Loja. app.ts só faz o HTTP.
//
// - Sem os secrets da whatsmiau não há remetente: pedido e verificação respondem 503
//   `login_unavailable` ("Login pelo WhatsApp indisponível no momento"); o checkout Guest não muda.
// - Pedido e verificação: rate limit por telefone E por IP (chaves com HMAC/hash, nada em claro),
//   depois Turnstile. A resposta do pedido é igual com ou sem conta (sem enumeração); só depois do
//   código certo o próprio dono do telefone sabe se precisa se cadastrar.
// - Código: aleatório uniforme, guardado como HMAC (chave derivada de BETTER_AUTH_SECRET), vale
//   5 min, 5 tentativas, uso único, reenvio após 30 s e no máximo 8 códigos por telefone em 24 h
//   (regras no INSERT/UPDATE de @foode/db; o teto diário contém a força bruta, Ticket 30).
// - Sessão do Consumidor separada da do Painel (tabela própria; cookie `__Host-`, httpOnly,
//   Secure, SameSite=Lax). O token só existe no cookie; o banco guarda o SHA-256.
// Dados pessoais: telefone, CPF e código nunca vão para log/Sentry (nenhum log aqui).
import type { FoodeDb, OpsCustomerRow } from "@foode/db";
import { FoodeDbError } from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";
import {
  CUSTOMER_ORDERS_LIMIT,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_SECONDS,
  CUSTOMER_SIGNUP_TTL_SECONDS,
  type CustomerCodeSent,
  customerCodeRequestSchema,
  type CustomerCodeVerified,
  customerCodeVerifySchema,
  type CustomerError,
  customerErrorHttpStatus,
  type CustomerOrders,
  type CustomerSessionState,
  customerSignupSchema,
  LOGIN_CODE_DAILY_MAX_PER_PHONE,
  LOGIN_CODE_DAILY_WINDOW_SECONDS,
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_REQUEST_IP_LIMIT,
  LOGIN_CODE_REQUEST_PHONE_LIMIT,
  LOGIN_CODE_RESEND_SECONDS,
  LOGIN_CODE_TTL_SECONDS,
  LOGIN_CODE_VERIFY_IP_LIMIT,
  LOGIN_CODE_VERIFY_PHONE_LIMIT,
  loginCodeMessage,
  maskCpf,
  opsCustomerChangePhoneInputSchema,
  opsCustomerFindInputSchema,
  type OpsCustomerView,
} from "@foode/shared/customer";
import { orderTrackingPath } from "@foode/shared/order";

import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import type { TurnstileVerifier } from "./auth/turnstile";
import {
  hmacSha256Hex,
  ipHash,
  orderAccessToken,
  phoneRateKey,
  randomToken,
  requireSecret,
  sha256Hex,
} from "./order-crypto";
import { callerHeaders } from "./painel-service";
import type { WhatsAppSender } from "./whatsapp/whatsmiau";

/** Cadastro (nome + CPF) por IP e por telefone verificado: contém a varredura de CPFs. */
export const CUSTOMER_SIGNUP_LIMIT = { max: 5, windowSeconds: 300 } as const;

export type CustomerServiceDeps = {
  db: FoodeDb;
  turnstile: TurnstileVerifier;
  /** null = secrets da whatsmiau ausentes (login indisponível). */
  whatsapp: WhatsAppSender | null;
  /** BETTER_AUTH_SECRET (chave derivada do HMAC do código e do telefone). */
  codeSecret: string | undefined;
  /** PHONE_LOOKUP_IP_SALT (hash do IP e do telefone nas chaves de rate limit). */
  ipSalt: string | undefined;
  /** ORDER_TOKEN_SECRET (link de acompanhamento em "meus Pedidos"). */
  orderTokenSecret: string | undefined;
  now?: () => Date;
};

/** Resposta HTTP: status, corpo e o `set-cookie` da sessão do Consumidor (quando muda). */
export type CustomerReply<T> = {
  status: 200 | 201 | 204 | 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503;
  body: T | CustomerError | null;
  setCookie?: string;
};

function failure(error: CustomerError): CustomerReply<never> {
  return { status: customerErrorHttpStatus(error.error), body: error };
}

/** Cookie da sessão no domínio do Storefront (sem `Domain`: vale só no host que respondeu). */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${CUSTOMER_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
  return `${CUSTOMER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** Token da sessão no header `cookie` (base64url de 43 caracteres); null se ausente/estranho. */
export function sessionTokenOf(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CUSTOMER_SESSION_COOKIE) {
      const value = rest.join("=");
      return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
    }
  }
  return null;
}

/** Código de 4 dígitos uniforme (rejeição para não enviesar o módulo). */
export function randomLoginCode(): string {
  const limit = 60_000; // múltiplo de 10 000 abaixo de 65 536
  const buffer = new Uint16Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value < limit)
      return String(value % 10 ** LOGIN_CODE_LENGTH).padStart(LOGIN_CODE_LENGTH, "0");
  }
}

/** Chaves do login (HMAC com chave derivada do segredo; nada em claro no banco). */
export async function loginCodeKeys(secret: string) {
  const key = await hmacSha256Hex(secret, "foode:customer-login-code:v1");
  return {
    phoneKey: (phone: string) => hmacSha256Hex(key, `phone|${phone}`),
    codeHash: (codeId: string, phone: string, code: string) =>
      hmacSha256Hex(key, `code|${codeId}|${phone}|${code}`),
  };
}

export function createCustomerService(deps: CustomerServiceDeps) {
  const { db, turnstile } = deps;
  const clock = deps.now ?? (() => new Date());

  async function rateLimited(
    scope: string,
    phone: string,
    ip: string | null,
    limits: {
      phone: { max: number; windowSeconds: number };
      ip: { max: number; windowSeconds: number };
    },
  ): Promise<boolean> {
    const salt = requireSecret(deps.ipSalt, "PHONE_LOOKUP_IP_SALT");
    const [byIp, byPhone] = await Promise.all([
      db.rateLimit.consume(`${scope}:ip:${await ipHash(salt, ip)}`, limits.ip),
      db.rateLimit.consume(`${scope}:phone:${await phoneRateKey(salt, phone)}`, limits.phone),
    ]);
    return !byIp || !byPhone;
  }

  async function currentSession(cookie: string | null | undefined) {
    const token = sessionTokenOf(cookie);
    if (!token) return null;
    const session = await db.customer.sessionByTokenHash(
      await sha256Hex(token),
      clock().toISOString(),
    );
    return session ? { token, session } : null;
  }

  async function signedInState(account: {
    id: string;
    name: string;
    phoneE164: string;
    cpf: string;
  }): Promise<CustomerSessionState> {
    return {
      state: "signed_in",
      account: {
        name: account.name,
        phone: account.phoneE164,
        cpfMasked: maskCpf(account.cpf),
        lastAddress: await db.customer.lastDeliveryAddress(account.id),
      },
    };
  }

  return {
    /** Sessão do Consumidor pelo cookie (checkout autenticado e boas-vindas); null = Guest. */
    currentSession,

    /** Pede o código: igual com ou sem conta; reenvio só depois de 30 s. */
    async requestCode(body: unknown, ip: string | null): Promise<CustomerReply<CustomerCodeSent>> {
      const parsed = customerCodeRequestSchema.safeParse(body);
      if (!parsed.success) return failure({ error: "invalid_input" });
      if (!deps.whatsapp) return failure({ error: "login_unavailable" });
      const { phone, turnstileToken } = parsed.data;
      if (
        await rateLimited("customer-code", phone, ip, {
          phone: LOGIN_CODE_REQUEST_PHONE_LIMIT,
          ip: LOGIN_CODE_REQUEST_IP_LIMIT,
        })
      ) {
        return failure({ error: "rate_limited" });
      }
      if (!(await turnstile.verify(turnstileToken, ip)))
        return failure({ error: "captcha_failed" });

      const keys = await loginCodeKeys(requireSecret(deps.codeSecret, "BETTER_AUTH_SECRET"));
      const now = clock();
      const codeId = crypto.randomUUID();
      const code = randomLoginCode();
      const issued = await db.customer.issueLoginCode({
        codeId,
        phoneKey: await keys.phoneKey(phone),
        codeHash: await keys.codeHash(codeId, phone, code),
        now: now.toISOString(),
        expiresAt: new Date(now.getTime() + LOGIN_CODE_TTL_SECONDS * 1000).toISOString(),
        resendSeconds: LOGIN_CODE_RESEND_SECONDS,
        daily: {
          max: LOGIN_CODE_DAILY_MAX_PER_PHONE,
          windowSeconds: LOGIN_CODE_DAILY_WINDOW_SECONDS,
        },
      });
      if (!issued.issued) {
        // Teto diário: mesma resposta de qualquer rate limit (não revela nada do telefone).
        if (issued.reason === "daily_limit") return failure({ error: "rate_limited" });
        return failure({ error: "resend_too_soon", retryAfterSeconds: issued.retryAfterSeconds });
      }
      const sent = await deps.whatsapp.sendText(phone, loginCodeMessage(code));
      if (!sent.ok) {
        await db.customer.discardLoginCode(codeId);
        return failure({ error: "login_unavailable" });
      }
      return {
        status: 200,
        body: {
          ok: true,
          expiresInSeconds: LOGIN_CODE_TTL_SECONDS,
          resendAfterSeconds: LOGIN_CODE_RESEND_SECONDS,
        },
      };
    },

    /** Confere o código (uma tentativa por chamada) e abre a sessão por cookie. */
    async verifyCode(
      body: unknown,
      ip: string | null,
    ): Promise<CustomerReply<CustomerCodeVerified>> {
      const parsed = customerCodeVerifySchema.safeParse(body);
      if (!parsed.success) return failure({ error: "invalid_input" });
      if (!deps.whatsapp) return failure({ error: "login_unavailable" });
      const { phone, code, turnstileToken } = parsed.data;
      if (
        await rateLimited("customer-verify", phone, ip, {
          phone: LOGIN_CODE_VERIFY_PHONE_LIMIT,
          ip: LOGIN_CODE_VERIFY_IP_LIMIT,
        })
      ) {
        return failure({ error: "rate_limited" });
      }
      if (!(await turnstile.verify(turnstileToken, ip)))
        return failure({ error: "captcha_failed" });

      const keys = await loginCodeKeys(requireSecret(deps.codeSecret, "BETTER_AUTH_SECRET"));
      const latest = await db.customer.latestLoginCode(await keys.phoneKey(phone));
      if (!latest || latest.consumedAt) return failure({ error: "code_expired" });
      const now = clock();
      const attempt = await db.customer.attemptLoginCode({
        codeId: latest.id,
        candidateHash: await keys.codeHash(latest.id, phone, code),
        now: now.toISOString(),
      });
      switch (attempt.kind) {
        case "wrong":
          return failure({ error: "code_invalid", attemptsLeft: attempt.attemptsLeft });
        case "exhausted":
          return failure({ error: "code_attempts_exhausted" });
        case "expired":
        case "missing":
          return failure({ error: "code_expired" });
        case "accepted":
          break;
      }
      const token = randomToken();
      const { hasAccount } = await db.customer.openSession({
        tokenHash: await sha256Hex(token),
        phoneE164: phone,
        now: now.toISOString(),
        accountExpiresAt: new Date(
          now.getTime() + CUSTOMER_SESSION_TTL_SECONDS * 1000,
        ).toISOString(),
        signupExpiresAt: new Date(now.getTime() + CUSTOMER_SIGNUP_TTL_SECONDS * 1000).toISOString(),
      });
      return {
        status: 200,
        body: { ok: true, status: hasAccount ? "signed_in" : "signup_required" },
        setCookie: sessionCookie(
          token,
          hasAccount ? CUSTOMER_SESSION_TTL_SECONDS : CUSTOMER_SIGNUP_TTL_SECONDS,
        ),
      };
    },

    /** 1º acesso: nome + CPF (validado) com o telefone verificado da sessão pendente. */
    async signup(
      body: unknown,
      cookie: string | null,
      ip: string | null,
    ): Promise<CustomerReply<CustomerSessionState>> {
      const current = await currentSession(cookie);
      if (!current) return failure({ error: "unauthenticated" });
      if (current.session.account) {
        return { status: 200, body: await signedInState(current.session.account) };
      }
      const parsed = customerSignupSchema.safeParse(body);
      if (!parsed.success) return failure({ error: "invalid_input" });
      if (
        await rateLimited("customer-signup", current.session.phoneE164, ip, {
          phone: CUSTOMER_SIGNUP_LIMIT,
          ip: CUSTOMER_SIGNUP_LIMIT,
        })
      ) {
        return failure({ error: "rate_limited" });
      }
      const now = clock();
      const outcome = await db.customer.createAccount({
        tokenHash: await sha256Hex(current.token),
        name: parsed.data.name,
        cpf: parsed.data.cpf,
        now: now.toISOString(),
        expiresAt: new Date(now.getTime() + CUSTOMER_SESSION_TTL_SECONDS * 1000).toISOString(),
      });
      if (outcome === "conflict") return failure({ error: "account_conflict" });
      if (outcome === "unauthenticated") return failure({ error: "unauthenticated" });
      const refreshed = await currentSession(cookie);
      if (!refreshed?.session.account) return failure({ error: "unauthenticated" });
      return {
        status: 201,
        body: await signedInState(refreshed.session.account),
        setCookie: sessionCookie(current.token, CUSTOMER_SESSION_TTL_SECONDS),
      };
    },

    /** Sai: apaga a sessão e o cookie (sempre 204). */
    async signOut(cookie: string | null): Promise<CustomerReply<null>> {
      const token = sessionTokenOf(cookie);
      if (token) await db.customer.deleteSession(await sha256Hex(token));
      return { status: 204, body: null, setCookie: clearedSessionCookie() };
    },

    /** Estado da sessão (anônimo, cadastro pendente ou conta com o último endereço). */
    async state(cookie: string | null): Promise<CustomerReply<CustomerSessionState>> {
      const current = await currentSession(cookie);
      if (!current) {
        return {
          status: 200,
          body: { state: "anonymous" },
          ...(sessionTokenOf(cookie) ? { setCookie: clearedSessionCookie() } : {}),
        };
      }
      if (!current.session.account) {
        return {
          status: 200,
          body: { state: "signup_required", phone: current.session.phoneE164 },
        };
      }
      return { status: 200, body: await signedInState(current.session.account) };
    },

    /** Pedidos da conta NESTA Loja (com o vínculo dos Guest do telefone verificado). */
    async orders(slug: string, cookie: string | null): Promise<CustomerReply<CustomerOrders>> {
      const current = await currentSession(cookie);
      const account = current?.session.account;
      if (!account) return failure({ error: "unauthenticated" });
      const rows = await db.customer.ordersInStore({
        slug,
        accountId: account.id,
        phoneE164: account.phoneE164,
        limit: CUSTOMER_ORDERS_LIMIT,
      });
      if (!rows) return failure({ error: "store_not_found" });
      const secret = requireSecret(deps.orderTokenSecret, "ORDER_TOKEN_SECRET");
      const orders = await Promise.all(
        rows.map(async (row) => ({
          code: row.code,
          status: row.status,
          fulfillment: row.fulfillment,
          createdAt: row.createdAt,
          totalCents: row.totalCents,
          trackingPath: orderTrackingPath(slug, await orderAccessToken(secret, row.id)),
        })),
      );
      return { status: 200, body: { orders } };
    },
  };
}

export type CustomerService = ReturnType<typeof createCustomerService>;

// ---- Ops: busca e troca de telefone (decisão 65) ----------------------------------------

function toOpsView(row: OpsCustomerRow): OpsCustomerView {
  return {
    accountId: row.accountId,
    name: row.name,
    phone: row.phoneE164,
    cpfMasked: maskCpf(row.cpf),
    createdAt: row.createdAt,
  };
}

/** RPCs do Ops (`ops.area`); Dono e Operador = `forbidden`. */
export function createOpsCustomerService(deps: { db: FoodeDb; auth: FoodeAuth }) {
  const { db, auth } = deps;

  async function asOps<O, T>(
    caller: PainelCaller,
    schema: { safeParse(input: unknown): { success: true; data: O } | { success: false } },
    input: unknown,
    operation: (ops: ReturnType<FoodeDb["ops"]>, data: O) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith("ops.area"));
    if (!result.ok) return { ok: false, error: result.error };
    if (result.authorized.kind !== "ops") return { ok: false, error: "forbidden" };
    try {
      return await operation(db.ops(result.authorized.ops), parsed.data);
    } catch (error) {
      if (error instanceof FoodeDbError) {
        return {
          ok: false,
          error: error.code === "slug_unavailable" ? "conflict" : error.code,
        };
      }
      throw error;
    }
  }

  return {
    /** Busca a conta por telefone ou CPF (CPF volta mascarado); sem conta = `not_found`. */
    opsCustomerFind: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsCustomerFindInputSchema, input, async (ops, data) => {
        const row = await ops.findCustomer(data);
        return row ? { ok: true, data: toOpsView(row) } : { ok: false, error: "not_found" };
      }),

    /** Troca o telefone (auditada; sessões da conta caem). Número de outra conta = `conflict`. */
    opsCustomerChangePhone: (caller: PainelCaller, input: unknown) =>
      asOps(caller, opsCustomerChangePhoneInputSchema, input, async (ops, data) => {
        await ops.changeCustomerPhone({
          accountId: data.accountId,
          phoneE164: data.phone,
          now: new Date().toISOString(),
        });
        return { ok: true, data: null };
      }),
  };
}

export type OpsCustomerService = ReturnType<typeof createOpsCustomerService>;
