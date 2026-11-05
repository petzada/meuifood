import { describe, expect, it, vi } from "vitest";

import { itemShareUrl, shareLink, storeShareUrl } from "./share";

const data = { text: "Veja", title: "Loja", url: "https://foode.test/loja/ze" };

describe("links de compartilhar (P-5.4)", () => {
  it("monta a URL da Loja e do item com `?item=`", () => {
    expect(storeShareUrl("https://foode.test", "ze")).toBe("https://foode.test/loja/ze");
    expect(itemShareUrl("https://foode.test", "ze", "abc")).toBe(
      "https://foode.test/loja/ze?item=abc",
    );
  });

  it("usa o Web Share quando existe", async () => {
    const share = vi.fn(async () => undefined);
    expect(await shareLink({ share }, data)).toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
  });

  it("cancelamento do usuário não copia o link", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("cancelado", "AbortError");
    });
    const writeText = vi.fn(async () => undefined);
    expect(await shareLink({ clipboard: { writeText }, share }, data)).toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("cai para copiar o link sem Web Share ou quando ele falha", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await shareLink({ clipboard: { writeText } }, data)).toBe("copied");
    const share = vi.fn(async () => {
      throw new Error("falhou");
    });
    expect(await shareLink({ clipboard: { writeText }, share }, data)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it("sem nenhum dos dois, avisa que não dá", async () => {
    expect(await shareLink({}, data)).toBe("unsupported");
  });
});
