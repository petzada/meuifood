import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMillionSendSender,
  EmailSendError,
  MILLIONSEND_EMAILS_URL,
  sendInBackground,
  type TransactionalEmail,
} from "./sender";
import { inviteEmail, passwordResetEmail, setPasswordUrl } from "./templates";

const ENV = { MILLIONSEND_API_KEY: "ms_chave_de_teste", EMAIL_FROM: "Foode <no-reply@foode.test>" };
const EMAIL: TransactionalEmail = {
  to: "dono@loja.test",
  subject: "Assunto",
  html: "<p>oi</p>",
  text: "oi",
  idempotencyKey: "invite-123",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMillionSendSender", () => {
  it("envia POST /emails com Bearer, Idempotency-Key e o payload Resend", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: "email_1" }));
    const result = await createMillionSendSender(ENV, fetcher).send(EMAIL);

    expect(result).toEqual({ id: "email_1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(MILLIONSEND_EMAILS_URL);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer ms_chave_de_teste");
    expect(headers.get("idempotency-key")).toBe("invite-123");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: ENV.EMAIL_FROM,
      to: ["dono@loja.test"],
      subject: "Assunto",
      html: "<p>oi</p>",
      text: "oi",
    });
  });

  it("sem chave ou remetente falha sem chamar a rede", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createMillionSendSender({ EMAIL_FROM: ENV.EMAIL_FROM }, fetcher).send(EMAIL),
    ).rejects.toMatchObject({ reason: "not_configured" });
    await expect(
      createMillionSendSender({ MILLIONSEND_API_KEY: "ms_x" }, fetcher).send(EMAIL),
    ).rejects.toMatchObject({ reason: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("domínio não verificado (4xx): erro só com o status, sem corpo nem dados", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ message: "domain not verified for dono@loja.test" }, { status: 403 }),
    );
    const error = await createMillionSendSender(ENV, fetcher)
      .send(EMAIL)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ reason: "rejected", status: 403 });
    expect(String((error as Error).message)).not.toContain("dono@loja.test");
    expect(String((error as Error).message)).not.toContain("ms_chave_de_teste");
  });

  it("rede fora e resposta sem id viram EmailSendError", async () => {
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network down");
    });
    await expect(createMillionSendSender(ENV, offline).send(EMAIL)).rejects.toMatchObject({
      reason: "network",
    });
    const noId = vi.fn<typeof fetch>(async () => Response.json({}));
    await expect(createMillionSendSender(ENV, noId).send(EMAIL)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });
});

describe("sendInBackground", () => {
  it("falha controlada: loga motivo e status, nunca destinatário, link ou chave", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending: Promise<unknown>[] = [];
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 422 }));
    const email = inviteEmail({
      to: "convidado@loja.test",
      storeName: "Loja A",
      role: "operator",
      url: setPasswordUrl("https://painel.foode.test", "TOKEN_SECRETO", "convite"),
      idempotencyKey: "invite-x",
    });

    sendInBackground(
      createMillionSendSender(ENV, fetcher),
      (p) => pending.push(p),
      "invite",
      email,
    );
    await Promise.all(pending);

    expect(errors).toHaveBeenCalledTimes(1);
    const logged = String(errors.mock.calls[0]![0]);
    expect(JSON.parse(logged)).toEqual({
      level: "error",
      message: "email_send_failed",
      kind: "invite",
      reason: "rejected",
      status: 422,
    });
    for (const secret of ["convidado@loja.test", "TOKEN_SECRETO", "ms_chave_de_teste"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("templates", () => {
  it("link de definir senha aponta para o Painel com token e fluxo", () => {
    const url = new URL(setPasswordUrl("https://painel.foode.test/qualquer", "abc", "reset"));
    expect(url.origin).toBe("https://painel.foode.test");
    expect(url.pathname).toBe("/definir-senha");
    expect(url.searchParams.get("token")).toBe("abc");
    expect(url.searchParams.get("fluxo")).toBe("reset");
  });

  it("escapa o nome da Loja no HTML", () => {
    const email = inviteEmail({
      to: "a@b.test",
      storeName: '<script>alert("x")</script>',
      role: "owner",
      url: "https://painel.foode.test/definir-senha?token=t&fluxo=convite",
      idempotencyKey: "k",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("72 horas");
  });

  it("reset informa o prazo de 1 hora", () => {
    const email = passwordResetEmail({
      to: "a@b.test",
      url: "https://x.test/r",
      idempotencyKey: "k",
    });
    expect(email.text).toContain("1 hora");
  });
});
