// Envio do código de acesso do Consumidor pela whatsmiau.dev (decisão 65), a partir do número
// oficial da Foode. REST compatível com Evolution API (referência: ceremony
// `lib/whatsapp/whatsmiau.ts`): `POST {base}/message/sendText/{instância}` com header `apikey`.
// Secrets OPCIONAIS no Worker (`WHATSMIAU_API_KEY`, `WHATSMIAU_INSTANCE_ID`; base em
// `WHATSMIAU_API_URL`, padrão https://api.whatsmiau.dev/v2): sem eles não há remetente e o login
// responde "Login pelo WhatsApp indisponível no momento" (o checkout Guest segue normal).
// Nunca registra o telefone, o código nem o corpo da resposta: só o status e a classe da falha.
import type { Env } from "../env";

export const WHATSMIAU_DEFAULT_API_URL = "https://api.whatsmiau.dev/v2";
const SEND_TIMEOUT_MS = 10_000;

export type WhatsAppSendResult = { ok: true } | { ok: false; reason: "unavailable" | "rejected" };

export interface WhatsAppSender {
  /** `to` em E.164 sem "+" (`55DD9XXXXXXXX`). */
  sendText(to: string, text: string): Promise<WhatsAppSendResult>;
}

/** Remetente da whatsmiau, ou null sem os secrets (login indisponível). */
export function createWhatsMiauSender(
  env: Pick<Env, "WHATSMIAU_API_KEY" | "WHATSMIAU_INSTANCE_ID" | "WHATSMIAU_API_URL">,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): WhatsAppSender | null {
  const apiKey = env.WHATSMIAU_API_KEY?.trim();
  const instance = env.WHATSMIAU_INSTANCE_ID?.trim();
  if (!apiKey || !instance) return null;
  const base = (env.WHATSMIAU_API_URL?.trim() || WHATSMIAU_DEFAULT_API_URL).replace(/\/+$/u, "");
  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;

  return {
    async sendText(to, text) {
      let response: Response;
      try {
        response = await fetcher(url, {
          method: "POST",
          headers: { apikey: apiKey, "content-type": "application/json" },
          body: JSON.stringify({ number: to, text }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
      } catch (error) {
        logFailure(null, error instanceof Error ? error.name : "erro");
        return { ok: false, reason: "unavailable" };
      }
      // Corpo descartado sem ler para log: pode ecoar o número.
      await response.body?.cancel().catch(() => undefined);
      if (response.ok) return { ok: true };
      logFailure(response.status, null);
      return {
        ok: false,
        reason:
          response.status >= 500 || response.status === 404 || response.status === 429
            ? "unavailable"
            : "rejected",
      };
    },
  };
}

function logFailure(status: number | null, cause: string | null): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      message: "whatsapp_send_failed",
      provider: "whatsmiau",
      status,
      cause,
    }),
  );
}
