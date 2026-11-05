// Fábrica do Better Auth (Ticket 22). Instância POR REQUEST: o D1 e os secrets só existem no
// `env`. Decisões (pesquisa-integracoes §1):
// - `createAuthDatabase(env.DB)` + `AUTH_SCHEMA_OPTIONS` (@foode/db): schema = migration 0001;
//   sem `transaction: true` (o D1 não tem transação interativa);
// - `baseURL` = URL pública do Painel (BETTER_AUTH_URL; o admin repassa `/api/auth/*` pelo
//   service binding), `trustedOrigins` = a origem dela; cookie first-party no domínio do Painel
//   com `httpOnly`, `Secure` e `SameSite=Lax`;
// - sem cadastro aberto (`disableSignUp`): usuários nascem só por convite (painel-service.ts) ou
//   pelo seed `foode_ops`. Definir senha (convite, 72 h) e reset (1 h) usam o MESMO endpoint
//   `POST /api/auth/reset-password` e o mesmo token de uso único em `verifications` (identificador
//   guardado com hash); só o prazo muda. O reset cria a conta `credential` se o usuário não tem;
// - e-mails pela MillionSend em `waitUntil` (não aguardar o envio: timing attack);
// - rate limit no D1 (`storage: "database"`; a memória do isolate não serve em Workers), IP de
//   `cf-connecting-ip` (o admin sobrescreve o header; a api não expõe `/api/auth/*` em público);
// - Turnstile pelo plugin `captcha` em login, pedido de reset e definir senha;
// - ids UUID (`crypto.randomUUID()`), como o resto do banco;
// - hash de senha: o padrão do Better Auth (scrypt N=16384, r=16, p=1). No workerd ele cai no
//   `node:crypto` nativo (nodejs_compat): ~100 ms de CPU por hash/verificação, medidos com os
//   mesmos parâmetros. Cabe com folga no teto do Workers Paid (30 s de CPU por request, padrão),
//   então não há `limits.cpu_ms` nem hash próprio — trocar o hash depois exigiria rehash no login.
import { AUTH_SCHEMA_OPTIONS, createAuthDatabase, createFoodeDb } from "@foode/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@foode/shared/auth";
import { betterAuth } from "better-auth";
import { captcha } from "better-auth/plugins";

import type { EmailSender } from "../email/sender";
import { sendInBackground } from "../email/sender";
import { passwordResetEmail, setPasswordUrl } from "../email/templates";
import type { Env } from "../env";

export const AUTH_BASE_PATH = "/api/auth";
/** Prazo do link de "definir senha" do convite (o reset vale 1 h). */
export const INVITE_TOKEN_TTL_SECONDS = 72 * 60 * 60;
export const RESET_TOKEN_TTL_SECONDS = 60 * 60;

/** Endpoints do Better Auth que exigem Turnstile (header `x-captcha-response`). */
export const CAPTCHA_ENDPOINTS = ["/sign-in/email", "/request-password-reset", "/reset-password"];

/** Janelas por IP (cf-connecting-ip) + caminho, guardadas na tabela `rate_limits`. */
export const AUTH_RATE_LIMIT_RULES = {
  "/sign-in/email": { window: 60, max: 5 },
  "/request-password-reset": { window: 300, max: 3 },
  "/reset-password": { window: 300, max: 10 },
} as const;

export type AuthDeps = {
  email: EmailSender;
  waitUntil(promise: Promise<unknown>): void;
};

/** Sessão crua do Better Auth, antes da revalidação de membership. */
export type AuthSession = {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
  expiresAt: string;
  activeStoreId: string | null;
};

export interface FoodeAuth {
  /** Handler HTTP de `/api/auth/*` (montado no fetch do PainelApi, só via binding). */
  handler(request: Request): Promise<Response>;
  /** Lê a sessão do header `cookie`; null se ausente, expirada ou revogada. */
  getSession(headers: Headers): Promise<AuthSession | null>;
  /** Grava a Loja ativa na sessão (o chamador já conferiu a membership). */
  setActiveStore(sessionId: string, storeId: string | null): Promise<void>;
  /** Revoga todas as sessões do usuário (remoção da última membership). */
  revokeUserSessions(userId: string): Promise<void>;
  /**
   * Cria o token de uso único de "definir senha" (consumido por `POST /api/auth/reset-password`)
   * com prazo próprio. Devolve o token em claro só para montar o link do e-mail.
   */
  createSetPasswordToken(userId: string, ttlSeconds: number): Promise<string>;
}

export class AuthConfigError extends Error {
  constructor(missing: string) {
    super(`configuração de Auth ausente: ${missing}`);
    this.name = "AuthConfigError";
  }
}

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Token aleatório (32 chars alfanuméricos, ~190 bits), mesmo formato do Better Auth. */
export function randomToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  // 256 % 62 ≠ 0: rejeita bytes do fim para não enviesar.
  let out = "";
  for (const byte of bytes) {
    if (byte < 248) out += TOKEN_ALPHABET[byte % 62];
  }
  return out.length >= length ? out.slice(0, length) : out + randomToken(length - out.length);
}

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function panelUrlOf(env: Pick<Env, "BETTER_AUTH_URL">): string {
  const raw = env.BETTER_AUTH_URL?.trim();
  if (!raw) throw new AuthConfigError("BETTER_AUTH_URL");
  return new URL(raw).origin;
}

export function createAuth(env: Env, deps: AuthDeps): FoodeAuth {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new AuthConfigError("BETTER_AUTH_SECRET");
  const panelUrl = panelUrlOf(env);
  const db = createFoodeDb(env.DB);

  const auth = betterAuth({
    appName: "Foode",
    baseURL: panelUrl,
    basePath: AUTH_BASE_PATH,
    secret,
    trustedOrigins: [panelUrl],
    database: createAuthDatabase(env.DB),
    user: AUTH_SCHEMA_OPTIONS.user,
    session: AUTH_SCHEMA_OPTIONS.session,
    verification: { storeIdentifier: "hashed" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        sendInBackground(
          deps.email,
          deps.waitUntil,
          "password_reset",
          passwordResetEmail({
            to: user.email,
            url: setPasswordUrl(panelUrl, token, "reset"),
            idempotencyKey: `reset-${crypto.randomUUID()}`,
          }),
        );
      },
      async onPasswordReset({ user }) {
        // Definir senha pelo link do e-mail prova a posse do endereço. A senha já foi gravada:
        // falha aqui só é registrada, não desfaz nem vira erro para o usuário.
        try {
          const context = await auth.$context;
          await context.internalAdapter.updateUser(user.id, { emailVerified: true });
          await db.access.recordAuthEvent(user.id, "auth.password_set");
        } catch (error) {
          const message = error instanceof Error ? error.message : "erro desconhecido";
          console.error(JSON.stringify({ level: "error", message, hook: "onPasswordReset" }));
        }
      },
    },
    rateLimit: {
      ...AUTH_SCHEMA_OPTIONS.rateLimit,
      enabled: true,
      window: 60,
      max: 60,
      customRules: AUTH_RATE_LIMIT_RULES,
    },
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "lax" },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      database: { generateId: () => crypto.randomUUID() },
      backgroundTasks: { handler: (promise) => deps.waitUntil(promise) },
    },
    telemetry: { enabled: false },
    plugins: [
      captcha({
        provider: "cloudflare-turnstile",
        secretKey: env.TURNSTILE_SECRET_KEY?.trim() ?? "",
        endpoints: CAPTCHA_ENDPOINTS,
      }),
    ],
  });

  return {
    handler: (request) => auth.handler(request),

    async getSession(headers) {
      const result = await auth.api.getSession({ headers });
      if (!result) return null;
      const activeStoreId = (result.session as { activeStoreId?: string | null }).activeStoreId;
      return {
        userId: result.user.id,
        email: result.user.email,
        name: result.user.name,
        sessionId: result.session.id,
        expiresAt: toIso(result.session.expiresAt),
        activeStoreId: activeStoreId ?? null,
      };
    },

    async setActiveStore(sessionId, storeId) {
      const context = await auth.$context;
      await context.adapter.update({
        model: "session",
        where: [{ field: "id", value: sessionId }],
        update: { activeStoreId: storeId, updatedAt: new Date() },
      });
    },

    async revokeUserSessions(userId) {
      const context = await auth.$context;
      await context.internalAdapter.deleteUserSessions(userId);
    },

    async createSetPasswordToken(userId, ttlSeconds) {
      const context = await auth.$context;
      const token = randomToken();
      await context.internalAdapter.createVerificationValue({
        identifier: `reset-password:${token}`,
        value: userId,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      });
      return token;
    },
  };
}
