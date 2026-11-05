// Ticket 13 sem banco: limites do D1 = contrato de @foode/shared; envio pela whatsmiau (fake no
// limite HTTP); login indisponível sem secrets; cookie da sessão; código e hashes; desconto.
import {
  COUPON_CODE_MAX as DB_COUPON_CODE_MAX,
  COUPON_CODE_MIN as DB_COUPON_CODE_MIN,
  COUPON_KINDS as DB_COUPON_KINDS,
  COUPON_WEEKDAYS_ALL as DB_WEEKDAYS_ALL,
  CUSTOMER_NAME_MAX as DB_CUSTOMER_NAME_MAX,
  type FoodeDb,
  LOGIN_CODE_MAX_ATTEMPTS as DB_LOGIN_CODE_MAX_ATTEMPTS,
} from "@foode/db";
import {
  COUPON_CODE_MAX,
  COUPON_CODE_MIN,
  COUPON_KINDS,
  COUPON_WEEKDAYS_ALL,
} from "@foode/shared/coupon";
import { CUSTOMER_SESSION_COOKIE, LOGIN_CODE_MAX_ATTEMPTS } from "@foode/shared/customer";
import { CUSTOMER_NAME_MAX } from "@foode/shared/order";
import { describe, expect, it, vi } from "vitest";

import type { CheckoutQuote } from "./checkout-rules";
import { withDiscount } from "./coupon-checkout";
import {
  clearedSessionCookie,
  createCustomerService,
  loginCodeKeys,
  randomLoginCode,
  sessionCookie,
  sessionTokenOf,
} from "./customer-service";
import { createWhatsMiauSender, WHATSMIAU_DEFAULT_API_URL } from "./whatsapp/whatsmiau";

describe("contrato D1 × @foode/shared", () => {
  it("limites de Cupom e conta iguais", () => {
    expect(DB_COUPON_CODE_MIN).toBe(COUPON_CODE_MIN);
    expect(DB_COUPON_CODE_MAX).toBe(COUPON_CODE_MAX);
    expect([...DB_COUPON_KINDS]).toEqual([...COUPON_KINDS]);
    expect(DB_WEEKDAYS_ALL).toBe(COUPON_WEEKDAYS_ALL);
    expect(DB_CUSTOMER_NAME_MAX).toBe(CUSTOMER_NAME_MAX);
    expect(DB_LOGIN_CODE_MAX_ATTEMPTS).toBe(LOGIN_CODE_MAX_ATTEMPTS);
  });
});

describe("whatsmiau", () => {
  it("sem chave ou instância não há remetente", () => {
    expect(createWhatsMiauSender({})).toBeNull();
    expect(createWhatsMiauSender({ WHATSMIAU_API_KEY: "k" })).toBeNull();
    expect(
      createWhatsMiauSender({ WHATSMIAU_INSTANCE_ID: " ", WHATSMIAU_API_KEY: "k" }),
    ).toBeNull();
  });

  it("POST sendText com apikey e a mensagem; nada pessoal no log da falha", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ key: { id: "m1" } }));
    const sender = createWhatsMiauSender(
      { WHATSMIAU_API_KEY: "chave", WHATSMIAU_INSTANCE_ID: "foode oficial" },
      fetcher,
    )!;
    await expect(sender.sendText("5511912345678", "0427 é o seu código")).resolves.toEqual({
      ok: true,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${WHATSMIAU_DEFAULT_API_URL}/message/sendText/foode%20oficial`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).apikey).toBe("chave");
    expect(JSON.parse(String(init?.body))).toEqual({
      number: "5511912345678",
      text: "0427 é o seu código",
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = createWhatsMiauSender(
      {
        WHATSMIAU_API_KEY: "chave",
        WHATSMIAU_INSTANCE_ID: "i",
        WHATSMIAU_API_URL: "https://x.test/",
      },
      async () => new Response("no LID found for 5511912345678@s.whatsapp.net", { status: 400 }),
    )!;
    await expect(failing.sendText("5511912345678", "0427")).resolves.toEqual({
      ok: false,
      reason: "rejected",
    });
    const down = createWhatsMiauSender(
      { WHATSMIAU_API_KEY: "c", WHATSMIAU_INSTANCE_ID: "i" },
      async () => {
        throw new TypeError("rede");
      },
    )!;
    await expect(down.sendText("5511912345678", "0427")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("5511912345678");
    expect(logged).not.toContain("0427");
    warn.mockRestore();
  });
});

describe("login indisponível sem secrets da whatsmiau", () => {
  it("pedido e verificação respondem 503 login_unavailable sem tocar no banco", async () => {
    const service = createCustomerService({
      db: {} as FoodeDb,
      turnstile: { verify: async () => true },
      whatsapp: null,
      codeSecret: "segredo-de-teste-com-mais-de-16",
      ipSalt: "sal-de-teste-com-mais-de-16",
      orderTokenSecret: undefined,
    });
    const request = await service.requestCode(
      { phone: "11912345678", turnstileToken: "t" },
      "10.0.0.1",
    );
    expect(request).toEqual({ status: 503, body: { error: "login_unavailable" } });
    const verify = await service.verifyCode(
      { phone: "11912345678", code: "1234", turnstileToken: "t" },
      "10.0.0.1",
    );
    expect(verify).toEqual({ status: 503, body: { error: "login_unavailable" } });
    await expect(service.requestCode({ phone: "x" }, null)).resolves.toMatchObject({ status: 400 });
  });
});

describe("cookie, código e hashes", () => {
  it("cookie __Host- httpOnly, Secure, SameSite=Lax, sem Domain", () => {
    const token = "a".repeat(43);
    const cookie = sessionCookie(token, 60);
    expect(cookie).toBe(
      `${CUSTOMER_SESSION_COOKIE}=${token}; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(cookie).not.toContain("Domain");
    expect(clearedSessionCookie()).toContain("Max-Age=0");
    expect(sessionTokenOf(`x=1; ${CUSTOMER_SESSION_COOKIE}=${token}`)).toBe(token);
    expect(sessionTokenOf(`${CUSTOMER_SESSION_COOKIE}=curto`)).toBeNull();
    expect(sessionTokenOf(null)).toBeNull();
  });

  it("código de 4 dígitos; hash depende do código, do telefone e do id", async () => {
    for (let i = 0; i < 200; i += 1) expect(randomLoginCode()).toMatch(/^\d{4}$/u);
    const keys = await loginCodeKeys("segredo-de-teste-com-mais-de-16");
    const hash = await keys.codeHash("id", "5511912345678", "0427");
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash).not.toContain("0427");
    expect(await keys.codeHash("id", "5511912345678", "0428")).not.toBe(hash);
    expect(await keys.codeHash("id2", "5511912345678", "0427")).not.toBe(hash);
    expect(await keys.phoneKey("5511912345678")).toMatch(/^[0-9a-f]{64}$/u);
    const other = await loginCodeKeys("outro-segredo-com-mais-de-16");
    expect(await other.codeHash("id", "5511912345678", "0427")).not.toBe(hash);
  });
});

describe("withDiscount", () => {
  it("desconto só nos itens; total = subtotal + taxa − desconto; nunca abaixo da taxa", () => {
    const quote = {
      subtotalCents: 2000,
      deliveryFeeCents: 500,
      discountCents: 0,
      totalCents: 2500,
    };
    expect(withDiscount(quote as CheckoutQuote, 300)).toMatchObject({
      discountCents: 300,
      totalCents: 2200,
    });
    expect(withDiscount(quote as CheckoutQuote, 9999)).toMatchObject({
      discountCents: 2000,
      totalCents: 500,
    });
  });
});
