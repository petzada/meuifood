// Pixel Meta e tag do Google da Loja visitada (Ticket 28, LNK-03, §6 Pixel): só se o Dono
// configurou, e só três eventos — `view_item` ao abrir o item, `add_to_cart` ao confirmar
// "Adicionar" e `purchase` na confirmação — com valor e moeda, nunca nome, telefone, e-mail ou
// CPF. O Pixel não é fonte do funil da Foode. Puro: recebe o `window` por parâmetro.
import type { StorefrontShowcase } from "@foode/shared/onboarding";

export type PixelIds = StorefrontShowcase["pixels"];

export type PixelEvent =
  | { name: "view_item"; itemId: string; itemName: string; priceCents: number }
  | { name: "add_to_cart"; itemId: string; itemName: string; valueCents: number; quantity: number }
  | { name: "purchase"; orderCode: number; valueCents: number };

export type PixelWindow = {
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
};

const CURRENCY = "BRL";

function reais(cents: number): number {
  return Math.round(cents) / 100;
}

/** Payloads enviados a cada rede (só ids de item, nomes de item, valor, moeda e código do Pedido). */
export function pixelPayloads(event: PixelEvent): {
  meta: [eventName: string, params: Record<string, unknown>];
  google: [eventName: string, params: Record<string, unknown>];
} {
  switch (event.name) {
    case "view_item":
      return {
        meta: [
          "ViewContent",
          {
            content_ids: [event.itemId],
            content_name: event.itemName,
            content_type: "product",
            currency: CURRENCY,
            value: reais(event.priceCents),
          },
        ],
        google: [
          "view_item",
          {
            currency: CURRENCY,
            items: [{ item_id: event.itemId, item_name: event.itemName }],
            value: reais(event.priceCents),
          },
        ],
      };
    case "add_to_cart":
      return {
        meta: [
          "AddToCart",
          {
            content_ids: [event.itemId],
            content_name: event.itemName,
            content_type: "product",
            currency: CURRENCY,
            value: reais(event.valueCents),
          },
        ],
        google: [
          "add_to_cart",
          {
            currency: CURRENCY,
            items: [{ item_id: event.itemId, item_name: event.itemName, quantity: event.quantity }],
            value: reais(event.valueCents),
          },
        ],
      };
    case "purchase":
      return {
        meta: ["Purchase", { currency: CURRENCY, value: reais(event.valueCents) }],
        google: [
          "purchase",
          {
            currency: CURRENCY,
            transaction_id: String(event.orderCode),
            value: reais(event.valueCents),
          },
        ],
      };
  }
}

/** Dispara nas redes configuradas; sem Pixel configurado, não faz nada. */
export function firePixelEvent(win: PixelWindow, pixels: PixelIds | null, event: PixelEvent): void {
  if (!pixels) return;
  const { meta, google } = pixelPayloads(event);
  try {
    if (pixels.metaPixelId && typeof win.fbq === "function") win.fbq("track", ...meta);
    if (pixels.googleTagId && typeof win.gtag === "function") win.gtag("event", ...google);
  } catch {
    // Pixel de terceiro nunca derruba o Storefront.
  }
}

/** Chave de "compra já enviada" (uma vez por Pedido no aparelho). */
export function purchaseSentKey(storeSlug: string, orderCode: number): string {
  return `foode:pixel:purchase:${storeSlug}:${orderCode}`;
}
