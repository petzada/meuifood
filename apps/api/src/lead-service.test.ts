import type { FoodeDb } from "@foode/db";
import { describe, expect, it, vi } from "vitest";

import { opsLeadsUrlOf } from "./app";
import type { TransactionalEmail } from "./email/sender";
import { createLeadService } from "./lead-service";

const SALT = "sal-de-teste-com-16-ou-mais";

function setup(options: { allowed?: boolean; captcha?: boolean; notify?: string } = {}) {
  const consume = vi.fn(async () => options.allowed ?? true);
  const create = vi.fn(async () => ({ leadId: "lead-1" }));
  const defaultPaymentFees = vi.fn(async () => [
    { method: "pix" as const, cardMode: null, percentBps: 99, fixedCents: 0 },
  ]);
  const db = {
    rateLimit: { consume },
    leads: { create },
    checkout: { defaultPaymentFees },
  } as unknown as FoodeDb;
  const verify = vi.fn(async () => options.captcha ?? true);
  const send = vi.fn<(email: TransactionalEmail) => Promise<{ id: string }>>(async () => ({
    id: "email",
  }));
  const pending: Promise<unknown>[] = [];
  const service = createLeadService({
    db,
    turnstile: { verify },
    email: { send },
    waitUntil: (promise) => pending.push(promise),
    ipSalt: SALT,
    notifyEmail: "notify" in options ? options.notify : "dono@foode.test",
    opsLeadsUrl: "https://admin.foode.test/ops/leads",
  });
  return { service, consume, create, verify, send, pending, defaultPaymentFees };
}

const body = {
  name: "Ana",
  whatsapp: "(11) 99999-1234",
  storeName: "Burger da Ana",
  city: "São Paulo",
  ordersPerDay: "ate_10",
  turnstileToken: "token",
};

describe("lead-service", () => {
  it("grava, avisa a Foode e nunca manda o token para o banco", async () => {
    const { service, create, send, pending, consume, verify } = setup();
    await expect(service.create(body, "203.0.113.9")).resolves.toEqual({
      status: 201,
      body: { ok: true },
    });
    expect(consume).toHaveBeenCalledWith(expect.stringMatching(/^lead:[0-9a-f]{64}$/u), {
      max: 3,
      windowSeconds: 300,
    });
    expect(verify).toHaveBeenCalledWith("token", "203.0.113.9");
    expect(create).toHaveBeenCalledWith({
      name: "Ana",
      whatsapp: "5511999991234",
      storeName: "Burger da Ana",
      city: "São Paulo",
      ordersPerDay: "ate_10",
    });
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0]![0];
    expect(email.to).toBe("dono@foode.test");
    expect(email.idempotencyKey).toBe("lead-notice:lead-1");
    expect(email.html).toContain("https://admin.foode.test/ops/leads");
  });

  it("rate limit antes do Turnstile; captcha reprovado não grava", async () => {
    const limited = setup({ allowed: false });
    await expect(limited.service.create(body, null)).resolves.toEqual({
      status: 429,
      body: { error: "rate_limited" },
    });
    expect(limited.verify).not.toHaveBeenCalled();
    expect(limited.create).not.toHaveBeenCalled();

    const denied = setup({ captcha: false });
    await expect(denied.service.create(body, null)).resolves.toEqual({
      status: 403,
      body: { error: "captcha_failed" },
    });
    expect(denied.create).not.toHaveBeenCalled();
    expect(denied.send).not.toHaveBeenCalled();
  });

  it("corpo inválido = 400 sem consumir o rate limit", async () => {
    const { service, consume } = setup();
    await expect(service.create({ ...body, whatsapp: "1" }, null)).resolves.toEqual({
      status: 400,
      body: { error: "invalid_input" },
    });
    expect(consume).not.toHaveBeenCalled();
  });

  it("sem destinatário configurado grava sem aviso", async () => {
    const { service, send, create } = setup({ notify: "" });
    await service.create(body, null);
    expect(create).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("tabela pública de taxas vem da tabela padrão", async () => {
    const { service } = setup();
    await expect(service.defaultFees()).resolves.toEqual({
      fees: [{ method: "pix", cardMode: null, percentBps: 99, fixedCents: 0 }],
    });
  });

  it("link do aviso aponta para /ops/leads do Painel", () => {
    expect(opsLeadsUrlOf({ BETTER_AUTH_URL: "https://admin.foode.test/x" })).toBe(
      "https://admin.foode.test/ops/leads",
    );
    expect(opsLeadsUrlOf({})).toBe(null);
  });
});
