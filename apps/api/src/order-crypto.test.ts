// Tokens e hashes do Pedido (Ticket 24a), sem banco.
import { orderAccessTokenSchema, phoneLookupConfirmTokenSchema } from "@foode/shared/order";
import { describe, expect, it } from "vitest";

import { redactPath } from "./app";
import {
  canonicalJson,
  ipHash,
  orderAccessToken,
  phoneRateKey,
  randomToken,
  requireSecret,
  sha256Hex,
  truncateIp,
} from "./order-crypto";

const SECRET = "segredo-de-teste-com-mais-de-16";

describe("token da página do Pedido", () => {
  it("determinístico por id, diferente entre Pedidos e segredos, no formato do contrato", async () => {
    const id = crypto.randomUUID();
    const token = await orderAccessToken(SECRET, id);
    expect(orderAccessTokenSchema.safeParse(token).success).toBe(true);
    await expect(orderAccessToken(SECRET, id)).resolves.toBe(token);
    await expect(orderAccessToken(SECRET, crypto.randomUUID())).resolves.not.toBe(token);
    await expect(orderAccessToken(`${SECRET}-outro`, id)).resolves.not.toBe(token);
    expect(token).not.toContain(id);
  });

  it("o banco guarda só o SHA-256 (hex minúsculo de 64)", async () => {
    const hash = await sha256Hex(await orderAccessToken(SECRET, crypto.randomUUID()));
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("segredo ausente ou curto = erro, sem padrão embutido", () => {
    expect(() => requireSecret(undefined, "ORDER_TOKEN_SECRET")).toThrow(
      "ORDER_TOKEN_SECRET ausente",
    );
    expect(() => requireSecret("curto", "ORDER_TOKEN_SECRET")).toThrow();
    expect(requireSecret(` ${SECRET} `, "X")).toBe(SECRET);
  });

  it("token do Sou eu é aleatório e no formato do contrato", () => {
    const a = randomToken();
    expect(phoneLookupConfirmTokenSchema.safeParse(a).success).toBe(true);
    expect(randomToken()).not.toBe(a);
  });
});

describe("IP e telefone da busca", () => {
  it("trunca IPv4 em /24 e IPv6 em /48", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0");
    expect(truncateIp("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::");
    expect(truncateIp("2001:0DB8:ABCD:0012:0000:0000:0000:0001")).toBe("2001:db8:abcd::");
    expect(truncateIp("::1")).toBe("0:0:0::");
    expect(truncateIp("999.1.1.1")).toBeNull();
    expect(truncateIp("não-é-ip")).toBeNull();
    expect(truncateIp(null)).toBeNull();
  });

  it("IPs da mesma /24 viram o mesmo hash; o hash depende do sal e não contém o IP", async () => {
    const a = await ipHash(SECRET, "203.0.113.1");
    expect(a).toMatch(/^[0-9a-f]{64}$/u);
    await expect(ipHash(SECRET, "203.0.113.200")).resolves.toBe(a);
    await expect(ipHash(SECRET, "203.0.114.1")).resolves.not.toBe(a);
    await expect(ipHash(`${SECRET}-2`, "203.0.113.1")).resolves.not.toBe(a);
  });

  it("chave do telefone no rate limit não contém o número", async () => {
    const key = await phoneRateKey(SECRET, "5511987654321");
    expect(key).not.toContain("987654321");
    await expect(phoneRateKey(SECRET, "5511987654321")).resolves.toBe(key);
  });
});

describe("JSON canônico (idempotência)", () => {
  it("independe da ordem das chaves e omite undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe(
      canonicalJson({ a: { d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });
});

describe("logs sem token", () => {
  it("redige o token do caminho da página do Pedido", () => {
    expect(redactPath("/storefront/lojas/loja-a/pedidos/abcDEF123_-xyz")).toBe(
      "/storefront/lojas/loja-a/pedidos/:token",
    );
    expect(redactPath("/storefront/lojas/loja-a/pedidos")).toBe("/storefront/lojas/loja-a/pedidos");
  });
});
