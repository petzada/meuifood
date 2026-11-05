// Fábrica do Better Auth (Ticket 22). Contrato; a fatia API implementa.
// Comportamento esperado de `createAuth(env, deps)` — instância POR REQUEST (o D1 e os secrets
// só existem no `env`):
// - `database: createAuthDatabase(env.DB)` e `...AUTH_SCHEMA_OPTIONS` (@foode/db): sem eles o
//   schema não bate com a migration 0001;
// - `secret: env.BETTER_AUTH_SECRET`, `baseURL: env.BETTER_AUTH_URL` (URL pública do Painel),
//   `trustedOrigins: [baseURL]`, `basePath: "/api/auth"`;
// - `emailAndPassword: { enabled: true, disableSignUp: true, sendResetPassword }`: sem cadastro
//   aberto; reset e "definir senha" do convite usam o mesmo token de uso único, enviado por
//   `deps.email` dentro de `deps.waitUntil` (não aguardar o envio: timing attack);
// - `rateLimit: { enabled: true, storage: "database", customRules }` (sign-in, reset);
//   `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`;
// - `advanced.database.generateId: () => crypto.randomUUID()` (ids UUID do repositório);
// - cookies `httpOnly`, `Secure`, `SameSite=Lax` no domínio do Painel (via proxy do admin);
// - Turnstile pelo plugin `captcha` (provider "cloudflare-turnstile") em sign-in e reset;
// - sem `transaction: true` no adapter (D1 não tem transação interativa).
import type { Env } from "../env";
import type { EmailSender } from "../email/sender";
import { NotImplementedError } from "./not-implemented";

export type AuthDeps = {
  email: EmailSender;
  waitUntil(promise: Promise<unknown>): void;
};

/** Sessão crua do Better Auth, antes da revalidação de membership. */
export type AuthSession = {
  userId: string;
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
}

export function createAuth(env: Env, deps: AuthDeps): FoodeAuth {
  void env;
  void deps;
  throw new NotImplementedError("createAuth");
}
