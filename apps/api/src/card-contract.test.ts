// Contrato do Ticket 27 sem banco: enums do D1 = os de @foode/shared/payment; o tokenizador sai
// do modo da Loja e só com as chaves do provedor; os clientes reais cumprem as interfaces dos
// adapters; as rotas novas existem (501 até a implementação) e nunca devolvem 404.
import {
  CARD_DECLINE_REASONS,
  CARD_PAYMENT_BRANDS,
  CARD_PAYMENT_STATES,
  CARD_MODES,
  type FoodeDb,
} from "@foode/db";
import { CARD_MODES as SHARED_CARD_MODES } from "@foode/shared/ops";
import * as payment from "@foode/shared/payment";
import { describe, expect, it } from "vitest";

import { createApp } from "./app";
import {
  type AbacatePayCardGateway,
  abacatePayCardFromEnv,
  createCardService,
  EFI_NOTIFICATION_PATH,
  type EfiCardGateway,
  efiCardFromEnv,
} from "./card-service";
import type { Env } from "./env";
import { createAbacatePayClient } from "./providers/abacatepay/client";
import { createEfiChargesClient } from "./providers/efi/client";

const efiEnv = {
  EFI_CLIENT_ID: "client-id",
  EFI_CLIENT_SECRET: "client-secret",
  EFI_PAYEE_CODE: "0123456789abcdef0123456789abcdef",
  EFI_NOTIFICATION_SECRET: "segredo-de-teste",
  API_PUBLIC_URL: "https://api.exemplo.test",
};
const abacateEnv = {
  ABACATEPAY_API_KEY: "abc_dev_chave",
  ABACATEPAY_WEBHOOK_SECRET: "segredo",
  ABACATEPAY_SIGNING_KEY: "assinatura",
  ABACATEPAY_PUBLIC_KEY: "pk_dev_publica",
};

describe("limites do D1 × @foode/shared/payment (Cartão)", () => {
  it("enums iguais", () => {
    expect([...CARD_PAYMENT_STATES]).toEqual([...payment.CARD_PAYMENT_STATES]);
    expect([...CARD_DECLINE_REASONS]).toEqual([...payment.CARD_DECLINE_REASONS]);
    expect([...CARD_PAYMENT_BRANDS]).toEqual([...payment.CARD_PAYMENT_BRANDS]);
    expect([...CARD_MODES]).toEqual([...SHARED_CARD_MODES]);
  });
});

describe("adapters e env", () => {
  it("os clientes reais cumprem as interfaces dos adapters", () => {
    const efi: EfiCardGateway = createEfiChargesClient({
      clientId: "x",
      clientSecret: "y",
      environment: "sandbox",
    });
    const abacate: AbacatePayCardGateway = createAbacatePayClient({ apiKey: "z" });
    expect(typeof efi.createCardCharge).toBe("function");
    expect(typeof abacate.getCardCharge).toBe("function");
  });

  it("sem qualquer chave do modo, o provedor é null", () => {
    expect(efiCardFromEnv({})).toBeNull();
    for (const key of Object.keys(efiEnv) as (keyof typeof efiEnv)[]) {
      expect(efiCardFromEnv({ ...efiEnv, [key]: " " }), key).toBeNull();
    }
    for (const key of Object.keys(abacateEnv) as (keyof typeof abacateEnv)[]) {
      expect(abacatePayCardFromEnv({ ...abacateEnv, [key]: undefined }), key).toBeNull();
    }
  });

  it("notification_url da Efí sem segredo na URL base; ambiente padrão produção", () => {
    const efi = efiCardFromEnv(efiEnv);
    expect(efi?.notificationUrl).toBe(`https://api.exemplo.test${EFI_NOTIFICATION_PATH}`);
    expect(efi?.notificationUrl).not.toContain("segredo");
    expect(efi?.environment).toBe("production");
    expect(efiCardFromEnv({ ...efiEnv, EFI_ENVIRONMENT: "sandbox" })?.environment).toBe("sandbox");
  });
});

describe("tokenizador por modo", () => {
  const db = {} as FoodeDb;
  const service = createCardService({
    db,
    efi: efiCardFromEnv(efiEnv),
    abacatePay: abacatePayCardFromEnv(abacateEnv),
  });

  it("Normal = Efí, Rápido = AbacatePay; sem modo = indisponível", () => {
    expect(service.tokenizerFor("normal")).toEqual({
      sdk: "efi",
      payeeCode: efiEnv.EFI_PAYEE_CODE,
      environment: "production",
    });
    expect(service.tokenizerFor("rapido")).toEqual({
      sdk: "abacatepay",
      publicKey: abacateEnv.ABACATEPAY_PUBLIC_KEY,
    });
    expect(service.tokenizerFor(null)).toBeNull();
    for (const mode of CARD_MODES) {
      expect(payment.cardTokenizerSchema.parse(service.tokenizerFor(mode)).sdk).toBe(
        payment.cardTokenizerSdkOf(mode),
      );
    }
  });

  it("modo sem as chaves do seu provedor = Crédito indisponível", () => {
    const onlyEfi = createCardService({ db, efi: efiCardFromEnv(efiEnv), abacatePay: null });
    expect(onlyEfi.available("normal")).toBe(true);
    expect(onlyEfi.available("rapido")).toBe(false);
  });
});

describe("rotas do Cartão (contrato)", () => {
  const env = { DB: {} as D1Database } as Env;
  const app = createApp();

  it("Tentar outro cartão e notificação da Efí existem", async () => {
    const retry = await app.request(
      "/storefront/lojas/loja-a/pedidos/token-qualquer/cartao",
      { method: "POST", body: "{}", headers: { "content-type": "application/json" } },
      env,
    );
    expect(retry.status).toBe(501);
    expect(retry.headers.get("cache-control")).toBe("no-store");
    const efi = await app.request(
      "/webhooks/efi?secret=x",
      {
        method: "POST",
        body: "notification=abc",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      },
      env,
    );
    expect(efi.status).toBe(501);
  });
});
