// Funil próprio e Pixel (Ticket 28): corpo só `{ event }`, uma vez por sessão e etapa,
// sendBeacon antes de fetch, falha silenciosa; Pixel só com ID configurado e sem dado pessoal.
import { describe, expect, it, vi } from "vitest";

import { funnelStorageKey, sendFunnelEvent, type FunnelStorage } from "./funnel";
import {
  firePixelEvent,
  hasPixelScripts,
  pixelPayloads,
  pixelSafeOrderPath,
  type PixelWindow,
} from "./pixels";

function memoryStorage(): FunnelStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("sendFunnelEvent", () => {
  it("manda só o nome do evento por sendBeacon, uma vez por sessão e etapa", async () => {
    const storage = memoryStorage();
    const sendBeacon = vi.fn(() => true);
    const fetch = vi.fn(async () => undefined);

    expect(sendFunnelEvent("ze", "visit", storage, { sendBeacon, fetch })).toBe(true);
    expect(sendFunnelEvent("ze", "visit", storage, { sendBeacon, fetch })).toBe(false);
    expect(sendFunnelEvent("ze", "item_view", storage, { sendBeacon, fetch })).toBe(true);
    expect(sendBeacon).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();

    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/loja/ze/eventos");
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text())).toEqual({ event: "visit" });
    expect(storage.data.get(funnelStorageKey("ze", "visit"))).toBe("1");
  });

  it("cai para fetch keepalive quando não há sendBeacon e nunca lança", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(sendFunnelEvent("ze", "checkout_start", null, { fetch })).toBe(true);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledWith(
      "/loja/ze/eventos",
      expect.objectContaining({
        body: '{"event":"checkout_start"}',
        keepalive: true,
        method: "POST",
      }),
    );
  });

  it("recusa evento fora do contrato (ex.: 'order', que só a api conta)", () => {
    const sendBeacon = vi.fn(() => true);
    expect(
      sendFunnelEvent("ze", "order" as unknown as "visit", memoryStorage(), { sendBeacon }),
    ).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe("Pixel", () => {
  const pixels = { metaPixelId: "123456789012345", googleTagId: "G-ABC123" };

  it("dispara view_item, add_to_cart e purchase só com valor, moeda e ids de item", () => {
    const win: PixelWindow = { fbq: vi.fn(), gtag: vi.fn() };
    firePixelEvent(win, pixels, {
      name: "view_item",
      itemId: "i1",
      itemName: "X-Burger",
      priceCents: 2550,
    });
    firePixelEvent(win, pixels, {
      name: "add_to_cart",
      itemId: "i1",
      itemName: "X-Burger",
      quantity: 2,
      valueCents: 5100,
    });
    firePixelEvent(win, pixels, { name: "purchase", orderCode: 42, valueCents: 5600 });

    expect(win.fbq).toHaveBeenNthCalledWith(
      1,
      "track",
      "ViewContent",
      expect.objectContaining({ currency: "BRL", value: 25.5 }),
    );
    expect(win.fbq).toHaveBeenNthCalledWith(3, "track", "Purchase", { currency: "BRL", value: 56 });
    expect(win.gtag).toHaveBeenNthCalledWith(
      2,
      "event",
      "add_to_cart",
      expect.objectContaining({ value: 51 }),
    );
    expect(win.gtag).toHaveBeenNthCalledWith(3, "event", "purchase", {
      currency: "BRL",
      transaction_id: "42",
      value: 56,
    });

    // Sem dado pessoal em nenhum payload.
    const serialized = JSON.stringify([
      ...(win.fbq as ReturnType<typeof vi.fn>).mock.calls,
      ...(win.gtag as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    for (const forbidden of [
      "phone",
      "email",
      "cpf",
      "telefone",
      "customer",
      "first_name",
      'fn"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    const keys = new Set<string>();
    const collect = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          collect(v);
        }
      }
    };
    collect(pixelPayloads({ name: "purchase", orderCode: 1, valueCents: 1 }));
    collect(
      pixelPayloads({
        name: "add_to_cart",
        itemId: "i",
        itemName: "n",
        quantity: 1,
        valueCents: 1,
      }),
    );
    expect([...keys].sort()).toEqual([
      "content_ids",
      "content_name",
      "content_type",
      "currency",
      "google",
      "item_id",
      "item_name",
      "items",
      "meta",
      "quantity",
      "transaction_id",
      "value",
    ]);
  });

  it("página do Pedido: nem Meta nem Google recebem o token da URL (Ticket 30)", () => {
    const token = "abcDEF123_-tokenSecretoDoPedido";
    const win: PixelWindow = { fbq: vi.fn(), gtag: vi.fn() };
    const beacon = vi.fn();
    const safePageUrl = `https://foodedelivery.com.br${pixelSafeOrderPath("lanchonete-do-ze")}`;
    firePixelEvent(
      win,
      pixels,
      { name: "purchase", orderCode: 42, valueCents: 5600 },
      { safePageUrl, beacon },
    );
    // Meta só pela imagem com a URL sem token; o fbq (que lê location.href) não é chamado.
    expect(win.fbq).not.toHaveBeenCalled();
    expect(beacon).toHaveBeenCalledTimes(1);
    const sent = new URL(beacon.mock.calls[0]![0] as string);
    expect(sent.origin + sent.pathname).toBe("https://www.facebook.com/tr");
    expect(sent.searchParams.get("dl")).toBe(
      "https://foodedelivery.com.br/loja/lanchonete-do-ze/pedido",
    );
    expect(sent.searchParams.get("ev")).toBe("Purchase");
    expect(sent.searchParams.get("cd[value]")).toBe("56");
    expect(win.gtag).toHaveBeenCalledWith("event", "purchase", {
      currency: "BRL",
      transaction_id: "42",
      value: 56,
      page_location: safePageUrl,
    });
    const everything = JSON.stringify([
      beacon.mock.calls,
      (win.gtag as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(everything).not.toContain(token);
    expect(everything).not.toContain("/pedido/");
  });

  it("navegação completa só quando há script de Pixel carregado", () => {
    expect(hasPixelScripts({})).toBe(false);
    expect(hasPixelScripts({ fbq: vi.fn() })).toBe(true);
    expect(hasPixelScripts({ gtag: vi.fn() })).toBe(true);
  });

  it("não dispara sem Pixel configurado nem sem o script carregado", () => {
    const win: PixelWindow = { fbq: vi.fn(), gtag: vi.fn() };
    firePixelEvent(win, null, { name: "purchase", orderCode: 1, valueCents: 100 });
    firePixelEvent(
      win,
      { metaPixelId: null, googleTagId: null },
      { name: "purchase", orderCode: 1, valueCents: 100 },
    );
    expect(win.fbq).not.toHaveBeenCalled();
    expect(win.gtag).not.toHaveBeenCalled();
    expect(() =>
      firePixelEvent({}, pixels, { name: "purchase", orderCode: 1, valueCents: 100 }),
    ).not.toThrow();
  });
});
