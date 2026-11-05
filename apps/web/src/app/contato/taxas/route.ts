// GET /contato/taxas — tabela padrão Foode vigente (PIX, Crédito Normal/Rápido) para a landing
// (decisão 70). Repassa `GET /storefront/taxas` da api pelo binding e confere o contrato; falha
// vira lista vazia (a landing mostra "combinada no cadastro", nada é inventado).
import { publicDefaultFeesResponseSchema } from "@foode/shared/ops";

import { apiFetch } from "../../../lib/api";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=300";

export async function GET(): Promise<Response> {
  try {
    const upstream = await apiFetch("/storefront/taxas", {
      headers: { accept: "application/json" },
    });
    if (upstream.ok) {
      const parsed = publicDefaultFeesResponseSchema.safeParse(
        await upstream.json().catch(() => null),
      );
      if (parsed.success) {
        return Response.json(parsed.data, { headers: { "cache-control": CACHE } });
      }
    } else {
      await upstream.body?.cancel();
    }
  } catch {
    // api fora: cai na lista vazia abaixo.
  }
  return Response.json({ fees: [] }, { headers: { "cache-control": "no-store" } });
}
