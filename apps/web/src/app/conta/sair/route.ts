// Sair da conta (Ticket 13): a api apaga o cookie; 204 sem corpo.
import { forwardAccount } from "../../../lib/account-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return forwardAccount(request, { apiPath: "/storefront/conta/sair", method: "POST" });
}
