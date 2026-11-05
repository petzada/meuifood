// Envio de e-mail transacional pela MillionSend (decisão 59; pesquisa-integracoes §2).
// - `POST https://api.millionsend.com/emails` com `Authorization: Bearer MILLIONSEND_API_KEY`
//   (wire-compatível com Resend; `fetch` puro, sem SDK, para não pesar o Worker);
// - `from` = `EMAIL_FROM` (`Foode <nao-responda@foodedelivery.com.br>` quando o domínio estiver
//   verificado, Ticket 25). Enquanto não estiver, a MillionSend recusa (4xx) e o erro sai
//   como `EmailSendError` com o status — o chamador loga e segue (falha controlada);
// - HTML renderizado na api (email/templates.ts) — `template` dá 422;
// - header `Idempotency-Key` = `idempotencyKey`;
// - nunca logar a chave, o destinatário, o link nem o token; erro carrega só o status HTTP.
import type { Env } from "../env";

export const MILLIONSEND_EMAILS_URL = "https://api.millionsend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

export type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export interface EmailSender {
  /** Envia e devolve o id da MillionSend (consultável em `GET /emails/{id}`). */
  send(email: TransactionalEmail): Promise<{ id: string }>;
}

/** Falha de envio sem dados sensíveis: só o motivo e o status HTTP. */
export class EmailSendError extends Error {
  constructor(
    readonly reason: "not_configured" | "rejected" | "network" | "invalid_response",
    readonly status: number | null = null,
  ) {
    super(
      status === null
        ? `envio de e-mail falhou: ${reason}`
        : `envio de e-mail falhou: ${reason} (HTTP ${status})`,
    );
    this.name = "EmailSendError";
  }
}

export function createMillionSendSender(
  env: Pick<Env, "MILLIONSEND_API_KEY" | "EMAIL_FROM">,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): EmailSender {
  return {
    async send(email) {
      const apiKey = env.MILLIONSEND_API_KEY?.trim();
      const from = env.EMAIL_FROM?.trim();
      if (!apiKey || !from) throw new EmailSendError("not_configured");

      let response: Response;
      try {
        response = await fetcher(MILLIONSEND_EMAILS_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "idempotency-key": email.idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
      } catch {
        throw new EmailSendError("network");
      }

      if (!response.ok) {
        // O corpo pode ecoar o destinatário: descartado sem ler.
        await response.body?.cancel();
        throw new EmailSendError("rejected", response.status);
      }
      const body: unknown = await response.json().catch(() => null);
      const id = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
      if (typeof id !== "string" || !id)
        throw new EmailSendError("invalid_response", response.status);
      return { id };
    },
  };
}

/**
 * Dispara o envio sem bloquear a resposta (timing attack, pesquisa §1) e loga a falha sem
 * dados pessoais. `kind` identifica o fluxo no log.
 */
export function sendInBackground(
  sender: EmailSender,
  waitUntil: (promise: Promise<unknown>) => void,
  kind: "invite" | "invite_notice" | "password_reset" | "lead_notice",
  email: TransactionalEmail,
): void {
  waitUntil(
    sender.send(email).then(
      ({ id }) => {
        console.log(JSON.stringify({ level: "info", message: "email_sent", kind, emailId: id }));
      },
      (error: unknown) => {
        const status = error instanceof EmailSendError ? error.status : null;
        const reason = error instanceof EmailSendError ? error.reason : "unexpected";
        console.error(
          JSON.stringify({ level: "error", message: "email_send_failed", kind, reason, status }),
        );
      },
    ),
  );
}
