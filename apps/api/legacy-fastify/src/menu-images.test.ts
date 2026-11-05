import { describe, expect, it } from "vitest";

import {
  assertMenuImageUploadRequest,
  isOwnedMenuImageObjectKey,
  MENU_IMAGE_MAX_BYTES,
  menuImageObjectKey,
  publicMenuImageUrl,
} from "./menu-images.js";

describe("contrato estreito de imagens do Cardápio (R2)", () => {
  const storeId = "11111111-1111-4111-8111-111111111111";

  it("gera chave sob o prefixo da Loja sem o cliente escolher path", () => {
    const key = menuImageObjectKey(storeId, "image/webp", "22222222-2222-4222-8222-222222222222");
    expect(key).toBe(
      "stores/11111111-1111-4111-8111-111111111111/menu/22222222-2222-4222-8222-222222222222.webp",
    );
  });

  it("aceita somente chaves da própria Loja", () => {
    const own = menuImageObjectKey(storeId, "image/jpeg", "33333333-3333-4333-8333-333333333333");
    expect(isOwnedMenuImageObjectKey(storeId, own)).toBe(true);
    expect(
      isOwnedMenuImageObjectKey(
        storeId,
        "stores/99999999-9999-4999-8999-999999999999/menu/33333333-3333-4333-8333-333333333333.jpg",
      ),
    ).toBe(false);
    expect(isOwnedMenuImageObjectKey(storeId, "../escape.jpg")).toBe(false);
  });

  it("monta URL pública a partir da base CDN sem assinatura de leitura", () => {
    expect(
      publicMenuImageUrl(
        "https://img.example.com/",
        "stores/a/menu/b.webp",
      ),
    ).toBe("https://img.example.com/stores/a/menu/b.webp");
  });

  it("rejeita MIME e tamanho fora do contrato", () => {
    expect(
      assertMenuImageUploadRequest({
        contentType: "image/gif",
        contentLength: 100,
      }).ok,
    ).toBe(false);
    expect(
      assertMenuImageUploadRequest({
        contentType: "image/png",
        contentLength: MENU_IMAGE_MAX_BYTES + 1,
      }).ok,
    ).toBe(false);
    expect(
      assertMenuImageUploadRequest({
        contentType: "image/png",
        contentLength: 2048,
      }),
    ).toEqual({
      ok: true,
      contentType: "image/png",
      contentLength: 2048,
    });
  });
});
