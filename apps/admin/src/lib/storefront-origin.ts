// Origem pública do Storefront para montar links absolutos (acompanhamento do Pedido no
// "Avisar no WhatsApp"). `STOREFRONT_ORIGIN` sobrescreve (wrangler.jsonc: o domínio próprio); o
// padrão é o domínio da decisão 15.
export const DEFAULT_STOREFRONT_ORIGIN = "https://foodedelivery.com.br";

export function storefrontOrigin(): string {
  const raw = process.env.STOREFRONT_ORIGIN?.trim();
  if (!raw) return DEFAULT_STOREFRONT_ORIGIN;
  return raw.replace(/\/+$/u, "");
}
