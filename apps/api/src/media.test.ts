// Imagens do Cardápio sem R2 real: leitura pública só de chaves do padrão, cabeçalhos seguros,
// base pública e remoção restrita ao prefixo da Loja. Com o R2 do Miniflare: menu.d1.test.ts (CI).
import { describe, expect, it } from "vitest";

import {
  deleteMenuImage,
  MEDIA_CACHE_CONTROL,
  mediaBaseUrl,
  menuImageExists,
  serveMenuImage,
} from "./media";

const STORE = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
const OTHER = "5a1d3b9f-7b62-4d4c-8e1f-2c3d4e5f6a70";
const FILE = "0b6f4d2e-3c1a-4e5b-9a8c-7d6e5f4a3b2c.png";

function fakeBucket(objects: Record<string, string>) {
  const gets: string[] = [];
  const deletes: string[] = [];
  const bucket = {
    async get(key: string) {
      gets.push(key);
      const body = objects[key];
      if (body === undefined) return null;
      return { body: new Blob([body]).stream(), size: body.length, httpEtag: '"e1"' };
    },
    async head(key: string) {
      return objects[key] === undefined ? null : { key };
    },
    async delete(key: string) {
      deletes.push(key);
    },
  } as unknown as R2Bucket;
  return { bucket, gets, deletes };
}

const request = new Request("https://api.foode.test/media/x");

describe("GET /media (leitura pública)", () => {
  it("serve a chave do padrão com tipo pela extensão, nosniff e cache imutável", async () => {
    const { bucket } = fakeBucket({ [`stores/${STORE}/menu/${FILE}`]: "png" });
    const response = await serveMenuImage(bucket, STORE, FILE, request);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe(MEDIA_CACHE_CONTROL);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await response.text()).toBe("png");
  });

  it("chave fora do padrão nem chega ao bucket", async () => {
    const { bucket, gets } = fakeBucket({});
    for (const [storeId, file] of [
      [STORE, "../segredo.png"],
      [STORE, "0b6f4d2e-3c1a-4e5b-9a8c-7d6e5f4a3b2c.svg"],
      [STORE, "foto.png"],
      ["loja-a", FILE],
      [`${STORE}/menu/..`, FILE],
    ] as const) {
      const response = await serveMenuImage(bucket, storeId, file, request);
      expect(response.status).toBe(404);
    }
    expect(gets).toEqual([]);
  });

  it("objeto inexistente = 404", async () => {
    const { bucket } = fakeBucket({});
    expect((await serveMenuImage(bucket, STORE, FILE, request)).status).toBe(404);
  });
});

describe("base pública e remoção", () => {
  it("base configurada sem barra final; sem ela, origem da request + /media", () => {
    expect(mediaBaseUrl("https://api.foode.test/media/")).toBe("https://api.foode.test/media");
    expect(mediaBaseUrl(undefined, "https://api.foode.test/storefront/x")).toBe(
      "https://api.foode.test/media",
    );
    expect(mediaBaseUrl(undefined)).toBeNull();
  });

  it("nunca apaga nem aceita chave de outra Loja", async () => {
    const key = `stores/${OTHER}/menu/${FILE}`;
    const { bucket, deletes } = fakeBucket({ [key]: "png" });
    await expect(deleteMenuImage(bucket, STORE, key)).resolves.toBe(false);
    await expect(menuImageExists(bucket, STORE, key)).resolves.toBe(false);
    expect(deletes).toEqual([]);
    await expect(deleteMenuImage(bucket, OTHER, key)).resolves.toBe(true);
    expect(deletes).toEqual([key]);
  });
});
