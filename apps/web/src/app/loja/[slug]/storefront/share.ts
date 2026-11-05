// Compartilhar Loja e item (decisão 63, P-5.4): Web Share quando o navegador tem, senão
// copia o link. Recebe o `navigator` por parâmetro para ser testável sem DOM.
import { menuItemSharePath } from "@foode/shared/menu";

export type ShareData = { text: string; title: string; url: string };

export type ShareOutcome = "copied" | "dismissed" | "shared" | "unsupported";

type ShareNavigator = {
  canShare?: (data: ShareData) => boolean;
  clipboard?: { writeText(text: string): Promise<void> };
  share?: (data: ShareData) => Promise<void>;
};

export function storeShareUrl(origin: string, storeSlug: string): string {
  return `${origin}/loja/${encodeURIComponent(storeSlug)}`;
}

export function itemShareUrl(origin: string, storeSlug: string, itemId: string): string {
  return `${origin}${menuItemSharePath(storeSlug, itemId)}`;
}

/** Tenta o Web Share; cancelamento pelo usuário não vira cópia (ele desistiu). */
export async function shareLink(nav: ShareNavigator, data: ShareData): Promise<ShareOutcome> {
  if (typeof nav.share === "function" && (nav.canShare?.(data) ?? true)) {
    try {
      await nav.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "dismissed";
      // Falha real do Web Share: cai para a cópia.
    }
  }
  if (nav.clipboard) {
    try {
      await nav.clipboard.writeText(data.url);
      return "copied";
    } catch {
      return "unsupported";
    }
  }
  return "unsupported";
}

export const shareOutcomeMessagePt: Record<
  Exclude<ShareOutcome, "dismissed" | "shared">,
  string
> = {
  copied: "Link copiado",
  unsupported: "Não foi possível compartilhar neste navegador.",
};
