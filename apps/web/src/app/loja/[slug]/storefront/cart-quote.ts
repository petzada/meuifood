// Recálculo do carrinho no servidor (Ticket 23): o navegador chama o route handler
// `/loja/{slug}/carrinho`, que encaminha à api pelo service binding. Nunca manda preço.
import { cartQuoteResponseSchema, type CartLine } from "@foode/shared/menu";

export type CartQuote = ReturnType<typeof cartQuoteResponseSchema.parse>;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function cartQuotePath(storeSlug: string): string {
  return `/loja/${encodeURIComponent(storeSlug)}/carrinho`;
}

/**
 * `null` quando o recálculo não está disponível (rede, 5xx, resposta fora do contrato):
 * o Storefront segue com o subtotal local e a api valida de novo no Pedido.
 */
export async function quoteCart(
  storeSlug: string,
  lines: CartLine[],
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<CartQuote | null> {
  if (lines.length === 0) return null;
  try {
    const response = await fetchImpl(cartQuotePath(storeSlug), {
      body: JSON.stringify({ lines }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return null;
    const parsed = cartQuoteResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
