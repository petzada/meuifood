import { painelApi } from "../../../../lib/painel-api";
import { proxyAuthRequest } from "../../../../lib/auth-proxy";

// `/api/auth/*` do Painel → `PainelApi.fetch` (Better Auth na api) pelo service binding.
// Ver lib/auth-proxy.ts. Nunca cacheado.
export const dynamic = "force-dynamic";

async function proxy(request: Request) {
  return proxyAuthRequest(request, await painelApi());
}

export { proxy as GET, proxy as POST };
