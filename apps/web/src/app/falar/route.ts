// GET /falar — WhatsApp de vendas da Foode (decisão 70). O número NUNCA vai para o HTML nem
// para o repositório: mora no secret `SALES_WHATSAPP` do Worker `foode-web` (sincronizado pelo
// deploy.yml) e só este handler o lê, no servidor, para responder 302 ao `wa.me`. Sem número
// válido, leva ao formulário de contato da landing. `no-store`: o destino pode mudar.
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { falarLocation } from "../../lib/falar";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  let raw: string | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    raw = env.SALES_WHATSAPP;
  } catch {
    raw = undefined;
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: falarLocation(raw, request.url),
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
