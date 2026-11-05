import { describe, expect, it } from "vitest";
import completedCard from "./__fixtures__/webhook-transparent-completed-card.json";
import completedPix from "./__fixtures__/webhook-transparent-completed-pix.json";
import refunded from "./__fixtures__/webhook-transparent-refunded.json";
import transferIgnored from "./__fixtures__/webhook-transfer-ignored.json";
import {
  AbacatePayWebhookPayloadError,
  parseAbacatePayWebhook,
  signAbacatePayBody,
  timingSafeEqualString,
  verifyAbacatePayWebhook,
} from "./webhook.js";

const WEBHOOK_SECRET = "test_webhook_secret";
const SIGNING_KEY = "test_signing_key";

describe("verifyAbacatePayWebhook", () => {
  const rawBody = JSON.stringify(completedPix);

  async function verify(overrides: Partial<Parameters<typeof verifyAbacatePayWebhook>[0]> = {}) {
    return verifyAbacatePayWebhook({
      rawBody,
      querySecret: WEBHOOK_SECRET,
      signatureHeader: await signAbacatePayBody(rawBody, SIGNING_KEY),
      webhookSecret: WEBHOOK_SECRET,
      signingKey: SIGNING_KEY,
      ...overrides,
    });
  }

  it("aceita segredo e assinatura corretos", async () => {
    await expect(verify()).resolves.toBe(true);
  });

  it("assinatura é HMAC-SHA256 base64 (vetor conhecido)", async () => {
    // RFC 4231 caso 2: key "Jefe", data "what do ya want for nothing?".
    await expect(signAbacatePayBody("what do ya want for nothing?", "Jefe")).resolves.toBe(
      "W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=",
    );
  });

  it("recusa segredo da URL errado", async () => {
    await expect(verify({ querySecret: "outro" })).resolves.toBe(false);
  });

  it("recusa corpo alterado depois de assinado", async () => {
    const signatureHeader = await signAbacatePayBody(rawBody, SIGNING_KEY);
    await expect(verify({ rawBody: rawBody.replace("5990", "1"), signatureHeader })).resolves.toBe(false);
  });

  it("recusa assinatura com outra chave", async () => {
    await expect(verify({ signatureHeader: await signAbacatePayBody(rawBody, "outra") })).resolves.toBe(false);
  });

  it("recusa sem header, sem segredo ou sem configuração", async () => {
    await expect(verify({ signatureHeader: null })).resolves.toBe(false);
    await expect(verify({ querySecret: undefined })).resolves.toBe(false);
    await expect(verify({ webhookSecret: "" })).resolves.toBe(false);
    await expect(verify({ signingKey: "" })).resolves.toBe(false);
  });
});

describe("timingSafeEqualString", () => {
  it("compara strings de tamanhos diferentes sem erro", async () => {
    await expect(timingSafeEqualString("a", "a")).resolves.toBe(true);
    await expect(timingSafeEqualString("a", "ab")).resolves.toBe(false);
  });
});

describe("parseAbacatePayWebhook", () => {
  it("PIX pago: evento transparent.completed com intentId", () => {
    expect(parseAbacatePayWebhook(JSON.stringify(completedPix))).toEqual({
      kind: "transparent",
      eventId: "log_TESTE000000000000000001",
      type: "transparent.completed",
      devMode: true,
      apiVersion: 2,
      charge: {
        id: "pix_char_TESTE000000000000000001",
        method: "PIX",
        status: "PAID",
        amountCents: 5990,
        platformFeeCents: 54,
        intentId: "intent_teste_001",
        metadata: { intentId: "intent_teste_001", pedidoId: "pedido_teste_001" },
      },
    });
  });

  it("cartão aprovado: método inferido pelo prefixo do id", () => {
    const event = parseAbacatePayWebhook(JSON.stringify(completedCard));
    expect(event.kind).toBe("transparent");
    if (event.kind !== "transparent") return;
    expect(event.charge).toMatchObject({ method: "CARD", status: "APPROVED", intentId: "intent_teste_002" });
  });

  it("estorno: transparent.refunded sem platformFee", () => {
    const event = parseAbacatePayWebhook(JSON.stringify(refunded));
    expect(event).toMatchObject({
      kind: "transparent",
      type: "transparent.refunded",
      charge: { status: "REFUNDED", platformFeeCents: null },
    });
  });

  it("eventos fora do escopo são ignorados sem erro", () => {
    expect(parseAbacatePayWebhook(JSON.stringify(transferIgnored))).toEqual({
      kind: "ignored",
      eventId: null,
      type: "transfer.completed",
      devMode: true,
    });
  });

  it("não expõe dados do pagador (taxId mascarado nem é lido)", () => {
    const event = parseAbacatePayWebhook(JSON.stringify(completedPix));
    expect(JSON.stringify(event)).not.toContain("taxId");
  });

  it("JSON inválido, sem id ou sem transparent viram erro de payload sem conteúdo do corpo", () => {
    expect(() => parseAbacatePayWebhook("{nao json")).toThrow(AbacatePayWebhookPayloadError);
    const semId = { ...completedPix, id: undefined };
    expect(() => parseAbacatePayWebhook(JSON.stringify(semId))).toThrow(/sem id/);
    const semTransparent = { ...completedPix, data: { customer: {} } };
    try {
      parseAbacatePayWebhook(JSON.stringify(semTransparent));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AbacatePayWebhookPayloadError);
      expect((error as Error).message).not.toContain("Cliente Teste");
    }
  });
});
