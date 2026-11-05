// Envio de e-mail transacional pela MillionSend (decisão 59; pesquisa-integracoes §2).
// Contrato; a fatia API do Ticket 22 implementa. Comportamento esperado do enviador:
// - `POST https://api.millionsend.com/emails` com `Authorization: Bearer MILLIONSEND_API_KEY`
//   (wire-compatível com Resend; `fetch` puro ou SDK `resend` com base URL trocada);
// - `from` = `EMAIL_FROM` (`Foode <nao-responda@foodedelivery.com.br>` quando o domínio
//   estiver verificado); HTML renderizado na api — `template` dá 422;
// - header `Idempotency-Key` = `idempotencyKey` (id do convite/reset);
// - nunca logar a chave, o link nem o token; erro → exceção com o status HTTP, sem o corpo.
import type { Env } from "../env";
import { NotImplementedError } from "../auth/not-implemented";

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

export function createMillionSendSender(
  env: Pick<Env, "MILLIONSEND_API_KEY" | "EMAIL_FROM">,
): EmailSender {
  void env;
  return {
    async send() {
      throw new NotImplementedError("MillionSend send");
    },
  };
}
