// Verificador do Turnstile (Ticket 22). Contrato; a fatia API implementa.
// Comportamento esperado: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
// com `secret` (TURNSTILE_SECRET_KEY), `response` (token) e `remoteip` (cf-connecting-ip);
// `true` só com `success: true`. Token vazio, rede fora ou secret ausente → `false`
// (falha fechada). Usado no convite; login e reset passam pelo plugin `captcha` do Better Auth.
import type { Env } from "../env";
import { NotImplementedError } from "./not-implemented";

export interface TurnstileVerifier {
  verify(token: string, ip: string | null): Promise<boolean>;
}

export function createTurnstileVerifier(env: Pick<Env, "TURNSTILE_SECRET_KEY">): TurnstileVerifier {
  void env;
  return {
    async verify() {
      throw new NotImplementedError("Turnstile verify");
    },
  };
}
