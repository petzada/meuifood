// Verificador do Turnstile (Ticket 22): `POST .../turnstile/v0/siteverify` com `secret`
// (TURNSTILE_SECRET_KEY), `response` (token) e `remoteip` (cf-connecting-ip); `true` só com
// `success: true`. Token vazio, rede fora, timeout ou secret ausente → `false` (falha fechada).
// Usado no convite; login, pedido de reset e definir senha passam pelo plugin `captcha` do
// Better Auth (auth.ts), que fala com o mesmo endpoint.
import type { Env } from "../env";

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 10_000;
const MAX_TOKEN_LENGTH = 2048;

export interface TurnstileVerifier {
  verify(token: string, ip: string | null): Promise<boolean>;
}

export function createTurnstileVerifier(
  env: Pick<Env, "TURNSTILE_SECRET_KEY">,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): TurnstileVerifier {
  return {
    async verify(token, ip) {
      const secret = env.TURNSTILE_SECRET_KEY?.trim();
      if (!secret || !token || token.length > MAX_TOKEN_LENGTH) return false;
      try {
        const response = await fetcher(TURNSTILE_SITEVERIFY_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
          signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        });
        if (!response.ok) return false;
        const body: unknown = await response.json();
        return Boolean(
          body && typeof body === "object" && (body as { success?: unknown }).success === true,
        );
      } catch {
        return false;
      }
    },
  };
}
