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

/**
 * Página do Pedido para os Pixels, SEM o token (Ticket 30): `/loja/{slug}/pedido`. O token da URL
 * dá acesso a nome, endereço e itens do Pedido; Meta e Google nunca o recebem.
 */
export function pixelSafeOrderPath(storeSlug: string): string {
  return `/loja/${encodeURIComponent(storeSlug)}/pedido`;
}

/**
 * Pixel da Meta como imagem (`/tr`, a forma "noscript" documentada pela Meta) com a URL da
 * página informada em `dl`: na página do Pedido o `fbevents.js` não carrega (ele lê
 * `location.href`, que tem o token).
 */
export function metaBeaconUrl(
  pixelId: string,
  [eventName, params]: [string, Record<string, unknown>],
  pageUrl: string,
): string {
  const url = new URL("https://www.facebook.com/tr");
  url.searchParams.set("id", pixelId);
  url.searchParams.set("ev", eventName);
  url.searchParams.set("dl", pageUrl);
  url.searchParams.set("rl", "");
  url.searchParams.set("noscript", "1");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(
      `cd[${key}]`,
      typeof value === "string" || typeof value === "number"
        ? String(value)
        : JSON.stringify(value),
    );
  }
  return url.href;
}

/** Página com segredo na URL: a URL sem segredo e como mandar a imagem do Pixel da Meta. */
export type PixelSecretPage = { safePageUrl: string; beacon: (url: string) => void };

/**
 * Dispara nas redes configuradas; sem Pixel configurado, não faz nada. Em página com segredo na
 * URL (`secretPage`), a Meta vai por imagem com a URL sem segredo e o Google com `page_location`.
 */
export function firePixelEvent(
  win: PixelWindow,
  pixels: PixelIds | null,
  event: PixelEvent,
  secretPage?: PixelSecretPage,
): void {
  if (!pixels) return;
  const { meta, google } = pixelPayloads(event);
  try {
    if (secretPage) {
      if (pixels.metaPixelId) {
        secretPage.beacon(metaBeaconUrl(pixels.metaPixelId, meta, secretPage.safePageUrl));
      }
      if (pixels.googleTagId && typeof win.gtag === "function") {
        win.gtag("event", google[0], { ...google[1], page_location: secretPage.safePageUrl });
      }
      return;
    }
    if (pixels.metaPixelId && typeof win.fbq === "function") win.fbq("track", ...meta);
    if (pixels.googleTagId && typeof win.gtag === "function") win.gtag("event", ...google);
  } catch {
    // Pixel de terceiro nunca derruba o Storefront.
  }
}

/** Há script de Pixel carregado nesta página (Meta ou Google)? */
export function hasPixelScripts(win: PixelWindow): boolean {
  return typeof win.fbq === "function" || typeof win.gtag === "function";
}

/** Chave de "compra já enviada" (uma vez por Pedido no aparelho). */
export function purchaseSentKey(storeSlug: string, orderCode: number): string {
  return `foode:pixel:purchase:${storeSlug}:${orderCode}`;
}
