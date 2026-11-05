// Conta do Consumidor (Ticket 13): GET = estado da sessão (sempre 200, `no-store`); POST =
// cadastro no 1º acesso (nome + CPF; conflito 409 com a mensagem do contrato).
import { customerSessionStateSchema, customerSignupSchema } from "@foode/shared/customer";

import { forwardAccount } from "../../lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return forwardAccount(request, {
    apiPath: "/storefront/conta",
    method: "GET",
    responseSchema: customerSessionStateSchema,
  });
}

export async function POST(request: Request) {
  return forwardAccount(request, {
    apiPath: "/storefront/conta",
    method: "POST",
    requestSchema: customerSignupSchema,
    responseSchema: customerSessionStateSchema,
  });
}
