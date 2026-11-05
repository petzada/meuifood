import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LeadResponse } from "../../lib/lead";
import { LeadForm } from "./lead-form";

// Widget do Turnstile trocado por um botão que entrega o token (sem script externo).
vi.mock("../turnstile", () => ({
  Turnstile: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button onClick={() => onToken("turnstile-token")} type="button">
      Verificar
    </button>
  ),
}));

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Seu nome"), "Ana Souza");
  await user.type(screen.getByLabelText("Seu WhatsApp"), "(11) 99999-1234");
  await user.type(screen.getByLabelText("Nome da loja"), "Burger da Ana");
  await user.type(screen.getByLabelText("Cidade"), "São Paulo");
  await user.selectOptions(screen.getByLabelText("Pedidos por dia"), "10_a_50");
}

describe("LeadForm", () => {
  it("valida no cliente e mostra o erro por campo sem chamar o transporte", async () => {
    const user = userEvent.setup();
    const submit = vi.fn<(input: unknown) => Promise<LeadResponse>>();
    render(<LeadForm submit={submit} />);
    await user.type(screen.getByLabelText("Seu WhatsApp"), "1234");
    await user.click(screen.getByRole("button", { name: "Quero falar com a Foode" }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(1);
    expect(screen.getByLabelText("Seu WhatsApp")).toHaveAttribute("aria-invalid", "true");
  });

  it("envia o contrato normalizado com a origem e confirma", async () => {
    const user = userEvent.setup();
    const submit = vi
      .fn<(input: unknown) => Promise<LeadResponse>>()
      .mockResolvedValue({ ok: true });
    render(<LeadForm source="hero" submit={submit} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Quero falar com a Foode" }));
    expect(submit).toHaveBeenCalledWith({
      name: "Ana Souza",
      whatsapp: "5511999991234",
      storeName: "Burger da Ana",
      city: "São Paulo",
      ordersPerDay: "10_a_50",
      source: "hero",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Recebemos seu contato.");
  });

  it("falha controlada (api fora, captcha, rate limit) mostra a mensagem e o atalho do WhatsApp", async () => {
    const user = userEvent.setup();
    const submit = vi
      .fn<(input: unknown) => Promise<LeadResponse>>()
      .mockResolvedValue({ ok: false, kind: "unavailable", message: "Ainda não dá." });
    render(<LeadForm submit={submit} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Quero falar com a Foode" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ainda não dá.");
    expect(screen.getByRole("link", { name: "Chamar no WhatsApp" })).toHaveAttribute(
      "href",
      "/falar",
    );
    // O formulário continua preenchido para tentar de novo.
    expect(screen.getByLabelText("Seu nome")).toHaveValue("Ana Souza");
  });

  it("com Turnstile: exige a verificação e manda o token junto com o lead", async () => {
    const user = userEvent.setup();
    const submit = vi
      .fn<(input: unknown) => Promise<LeadResponse>>()
      .mockResolvedValue({ ok: true });
    render(<LeadForm source="hero" submit={submit} turnstileSiteKey="site-key" />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Quero falar com a Foode" }));
    expect(submit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("verificação de segurança");

    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await user.click(screen.getByRole("button", { name: "Quero falar com a Foode" }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ storeName: "Burger da Ana", turnstileToken: "turnstile-token" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Recebemos seu contato.");
  });
});
