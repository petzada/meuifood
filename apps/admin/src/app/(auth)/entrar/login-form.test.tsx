// Componente: login do Painel (/entrar). Validação no envio, Turnstile obrigatório,
// erro do Better Auth em PT-BR e redirecionamento. Turnstile e fetch de auth mocados.
import { screen } from "@testing-library/react";

import { render } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AuthClient from "../../../lib/auth-client";
import type { AuthOutcome } from "../../../lib/auth-client";
import { LoginForm } from "./login-form";

const signIn = vi.hoisted(() =>
  vi.fn<
    (input: { email: string; password: string; turnstileToken: string }) => Promise<AuthOutcome>
  >(),
);
const turnstileReset = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/auth-client", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthClient>()),
  signInWithEmail: signIn,
}));

// Widget falso: um botão entrega o token como o callback do Turnstile faria.
vi.mock("../../../components/turnstile", () => ({
  Turnstile: forwardRef<{ reset(): void }, { onToken: (token: string | null) => void }>(
    function FakeTurnstile({ onToken }, ref) {
      useImperativeHandle(ref, () => ({ reset: turnstileReset }));
      return (
        <button onClick={() => onToken("token-de-teste")} type="button">
          Confirmar verificação
        </button>
      );
    },
  ),
}));

const assign = vi.fn();

beforeEach(() => {
  signIn.mockReset();
  turnstileReset.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const user = userEvent.setup();
  render(<LoginForm next="/cardapio" siteKey="site-key-de-teste" />);
  return {
    email: screen.getByLabelText("E-mail"),
    password: screen.getByLabelText("Senha"),
    submit: screen.getByRole("button", { name: "Entrar no Painel" }),
    user,
  };
}

describe("LoginForm (/entrar)", () => {
  it("envio vazio marca e-mail, senha e verificação sem chamar a api", async () => {
    const { email, password, submit, user } = setup();
    await user.click(submit);

    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Informe um e-mail válido.");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription("Informe sua senha.");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Aguarde a verificação de segurança terminar.",
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it("e-mail inválido continua bloqueado mesmo com senha e verificação", async () => {
    const { email, password, submit, user } = setup();
    await user.type(email, "dono@");
    await user.type(password, "senha-forte-123");
    await user.click(screen.getByRole("button", { name: "Confirmar verificação" }));
    await user.click(submit);

    expect(email).toHaveAccessibleDescription("Informe um e-mail válido.");
    expect(password).not.toHaveAttribute("aria-invalid");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("credencial errada mostra a mensagem PT-BR e pede token novo ao Turnstile", async () => {
    signIn.mockResolvedValue({ error: "credentials", ok: false });
    const { email, password, submit, user } = setup();
    await user.type(email, "dono@loja.com.br");
    await user.type(password, "senha-errada");
    await user.click(screen.getByRole("button", { name: "Confirmar verificação" }));
    await user.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha incorretos.");
    expect(signIn).toHaveBeenCalledWith({
      email: "dono@loja.com.br",
      password: "senha-errada",
      turnstileToken: "token-de-teste",
    });
    expect(turnstileReset).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
    expect(submit).toBeEnabled();
  });

  it("login certo navega para o destino pedido", async () => {
    signIn.mockResolvedValue({ ok: true });
    const { email, password, submit, user } = setup();
    await user.type(email, "dono@loja.com.br");
    await user.type(password, "senha-certa-123");
    await user.click(screen.getByRole("button", { name: "Confirmar verificação" }));
    await user.click(submit);

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/cardapio"));
    expect(screen.getByRole("button", { name: "Entrando..." })).toBeDisabled();
  });
});
