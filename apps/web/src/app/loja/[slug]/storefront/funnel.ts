// Funil próprio do Storefront (Ticket 28, P-REL-4): visita → item → carrinho → checkout, um
// envio por sessão do navegador e etapa, só `{ event }` (sem IP, telefone, cookie ou id de
// Consumidor: o schema é `.strict()`). `navigator.sendBeacon` quando existe (sobrevive à
// navegação), senão `fetch` keepalive; toda falha é silenciosa. `order` é contado pela api.
import { funnelEventRequestSchema, type ClientFunnelEvent } from "@foode/shared/onboarding";

export type FunnelTransport = {
  sendBeacon?: ((url: string, data: Blob) => boolean) | undefined;
  fetch?: ((url: string, init: RequestInit) => Promise<unknown>) | undefined;
};

export type FunnelStorage = Pick<Storage, "getItem" | "setItem">;

export function funnelEventsPath(storeSlug: string): string {
  return `/loja/${encodeURIComponent(storeSlug)}/eventos`;
}

export function funnelStorageKey(storeSlug: string, event: ClientFunnelEvent): string {
  return `foode:funil:${storeSlug}:${event}`;
}

/**
 * Envia a etapa uma vez por sessão (chave em `sessionStorage`). Devolve se enviou agora.
 * O corpo passa pelo schema do contrato antes de sair: qualquer campo a mais é recusado aqui.
 */
export function sendFunnelEvent(
  storeSlug: string,
  event: ClientFunnelEvent,
  storage: FunnelStorage | null,
  transport: FunnelTransport,
): boolean {
  const parsed = funnelEventRequestSchema.safeParse({ event });
  if (!parsed.success) return false;
  const key = funnelStorageKey(storeSlug, event);
  try {
    if (storage?.getItem(key)) return false;
    storage?.setItem(key, "1");
  } catch {
    // Storage bloqueado: envia mesmo assim (no máximo repete nesta sessão).
  }
  const url = funnelEventsPath(storeSlug);
  const body = JSON.stringify(parsed.data);
  try {
    if (transport.sendBeacon) {
      const sent = transport.sendBeacon(url, new Blob([body], { type: "application/json" }));
      if (sent) return true;
    }
    if (transport.fetch) {
      const request = transport.fetch(url, {
        body,
        headers: { "content-type": "application/json" },
        keepalive: true,
        method: "POST",
      });
      void Promise.resolve(request).catch(() => undefined);
      return true;
    }
  } catch {
    // silencioso
  }
  return false;
}

function sessionStorageOrNull(): FunnelStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Atalho do navegador: `sessionStorage` + `sendBeacon`/`fetch` do `window`. */
export function trackFunnel(storeSlug: string, event: ClientFunnelEvent): void {
  if (typeof window === "undefined") return;
  sendFunnelEvent(storeSlug, event, sessionStorageOrNull(), {
    sendBeacon:
      typeof navigator.sendBeacon === "function"
        ? (url, data) => navigator.sendBeacon(url, data)
        : undefined,
    fetch: async (url, init) => {
      try {
        await fetch(url, init);
      } catch {
        // silencioso
      }
    },
  });
}
