// Pedidos da conta NESTA Loja (Ticket 13): nenhuma consulta atravessa Lojas; sem sessão = 401.
import { customerOrdersSchema } from "@foode/shared/customer";
import { storeSlugSchema } from "@foode/shared/menu";

import { forwardAccount } from "../../../../../lib/account-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsedSlug = storeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return Response.json({ error: "store_not_found" }, { status: 404 });
  return forwardAccount(request, {
    apiPath: `/storefront/lojas/${encodeURIComponent(parsedSlug.data)}/conta/pedidos`,
    method: "GET",
    responseSchema: customerOrdersSchema,
  });
}
