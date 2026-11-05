// Verificação do código (Ticket 13): o `set-cookie` da sessão do Consumidor volta ao navegador.
import { customerCodeVerifiedSchema, customerCodeVerifySchema } from "@foode/shared/customer";

import { forwardAccount } from "../../../../lib/account-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return forwardAccount(request, {
    apiPath: "/storefront/conta/codigo/verificar",
    method: "POST",
    requestSchema: customerCodeVerifySchema,
    responseSchema: customerCodeVerifiedSchema,
  });
}
