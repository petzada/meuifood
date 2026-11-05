// Pedido do código de 4 dígitos no WhatsApp (Ticket 13, decisão 65). Resposta igual com ou sem
// conta (sem enumeração); 429/503 passam com o corpo do contrato.
import { customerCodeRequestSchema, customerCodeSentSchema } from "@foode/shared/customer";

import { forwardAccount } from "../../../lib/account-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return forwardAccount(request, {
    apiPath: "/storefront/conta/codigo",
    method: "POST",
    requestSchema: customerCodeRequestSchema,
    responseSchema: customerCodeSentSchema,
  });
}
