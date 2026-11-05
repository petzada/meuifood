// Componente (decisão 67): entrada por código no WhatsApp (Ticket 13, decisão 65). Telefone →
// código com reenvio após 30 s (contador), tentativas restantes e esgotadas, login indisponível
// como mensagem controlada, e o cadastro do 1º acesso com CPF (máscara, validação, conflito).
// A api da conta entra mocada; o Turnstile é um botão que entrega um token.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountApi } from "./account-api";
import { LoginFlow } from "./login-flow";
import { formatCpfInput, resendSecondsLeft, validateSignup } from "./login-state";

vi.mock("../../../../components/turnstile", () => ({
  Turnstile: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button onClick={() => onToken("turnstile-token")} type="button">
      Verificação de segurança
    </button>
  ),
}));

const account = {
  cpfMasked: "***.456.789-**",
  lastAddress: null,
  name: "Ana Lima",
  phone: "5511987654321",
};

const sent = {
  kind: "ok" as const,
  data: { expiresInSeconds: 300, ok: true as const, resendAfterSeconds: 30 },
};

function fakeApi(overrides: Partial<AccountApi> = {}): AccountApi {
  return {
    orders: vi.fn(async () => ({ kind: "ok" as const, data: { orders: [] } })),
    requestCode: vi.fn(async () => sent),
    session: vi.fn(async () => ({
      kind: "ok" as const,
      data: { account, state: "signed_in" as const },
    })),
    signOut: vi.fn(async () => ({ kind: "ok" as const, data: null })),
    signup: vi.fn(async () => ({
      kind: "ok" as const,
      data: { account, state: "signed_in" as const },
    })),
    verifyCode: vi.fn(async () => ({
      kind: "ok" as const,
      data: { ok: true as const, status: "signed_in" as const },
    })),
    ...overrides,
  };
}

let clock = Date.parse("2026-11-05T12:00:00.000Z");

function setup(options: { api?: AccountApi; startAtSignup?: boolean } = {}) {
  const api = options.api ?? fakeApi();
  const onSignedIn = vi.fn();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <LoginFlow
      api={api}
      now={() => clock}
      onSignedIn={onSignedIn}
      siteKey="site-key"
      {...(options.startAtSignup ? { startAtSignup: true } : {})}
    />,
  );
  return { api, onSignedIn, user };
}

async function requestCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("WhatsApp"), "11987654321");
  await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
  await user.click(screen.getByRole("button", { name: "Receber código" }));
  return screen.findByLabelText("Código");
}

async function confirmCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.type(screen.getByLabelText("Código"), code);
  await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
  await user.click(screen.getByRole("button", { name: "Confirmar código" }));
}

beforeEach(() => {
  clock = Date.parse("2026-11-05T12:00:00.000Z");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LoginFlow", () => {
  it("pede o código com Turnstile, aceita one-time-code e entra com o código certo", async () => {
    const { api, onSignedIn, user } = setup();
    expect(screen.queryByLabelText("Código")).not.toBeInTheDocument();
    const codeInput = await requestCode(user);
    expect(api.requestCode).toHaveBeenCalledWith({
      phone: "(11) 98765-4321",
      turnstileToken: "turnstile-token",
    });
    expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
    expect(codeInput).toHaveAttribute("inputmode", "numeric");
    expect(codeInput).toHaveFocus();
    expect(screen.getByText(/Reenviar código em 30 s/u)).toBeInTheDocument();

    await confirmCode(user, "12 34");
    expect(api.verifyCode).toHaveBeenCalledWith({
      code: "1234",
      phone: "(11) 98765-4321",
      turnstileToken: "turnstile-token",
    });
    expect(onSignedIn).toHaveBeenCalledWith(account);
  });

  it("reenvio libera depois de 30 s com contador e pede um código novo", async () => {
    const { api, user } = setup();
    await requestCode(user);
    expect(screen.queryByRole("button", { name: "Reenviar código" })).not.toBeInTheDocument();
    clock += 29_000;
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/Reenviar código em 1 s/u)).toBeInTheDocument();
    clock += 1000;
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
    await user.click(await screen.findByRole("button", { name: "Reenviar código" }));
    expect(api.requestCode).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Reenviar código em 30 s/u)).toBeInTheDocument();
  });

  it("código errado mostra as tentativas restantes e, esgotadas, manda pedir outro", async () => {
    const verifyCode = vi
      .fn()
      .mockResolvedValueOnce({ kind: "error", error: { attemptsLeft: 4, error: "code_invalid" } })
      .mockResolvedValueOnce({ kind: "error", error: { error: "code_attempts_exhausted" } });
    const { onSignedIn, user } = setup({ api: fakeApi({ verifyCode }) });
    await requestCode(user);
    await confirmCode(user, "0000");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Código incorreto. Você ainda tem 4 tentativas.",
    );
    expect(screen.getByLabelText("Código")).toHaveValue("");
    expect(screen.getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");
    await confirmCode(user, "0000");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você errou o código muitas vezes. Peça um novo código.",
    );
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("login indisponível é uma mensagem controlada, sem sair da tela do telefone", async () => {
    const api = fakeApi({
      requestCode: vi.fn(async () => ({
        kind: "error" as const,
        error: { error: "login_unavailable" as const },
      })),
    });
    const { user } = setup({ api });
    await user.type(screen.getByLabelText("WhatsApp"), "11987654321");
    await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
    await user.click(screen.getByRole("button", { name: "Receber código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Login pelo WhatsApp indisponível no momento",
    );
    expect(screen.getByLabelText("WhatsApp")).toBeInTheDocument();
    expect(screen.queryByLabelText("Código")).not.toBeInTheDocument();
  });

  it("1º acesso pede nome + CPF com máscara e validação; conflito usa a mensagem do contrato", async () => {
    const signup = vi
      .fn()
      .mockResolvedValueOnce({ kind: "error", error: { error: "account_conflict" } })
      .mockResolvedValueOnce({ kind: "ok", data: { account, state: "signed_in" } });
    const api = fakeApi({
      signup,
      verifyCode: vi.fn(async () => ({
        kind: "ok" as const,
        data: { ok: true as const, status: "signup_required" as const },
      })),
    });
    const { onSignedIn, user } = setup({ api });
    await requestCode(user);
    await confirmCode(user, "1234");
    const cpf = await screen.findByLabelText("CPF");
    expect(cpf).toHaveAttribute("inputmode", "numeric");

    await user.click(screen.getByRole("button", { name: "Criar minha conta" }));
    expect(screen.getByText("Informe seu nome.")).toBeInTheDocument();
    expect(screen.getByText("Informe seu CPF.")).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Nome e sobrenome"), "Ana Lima");
    await user.type(cpf, "11111111111");
    expect(cpf).toHaveValue("111.111.111-11");
    await user.click(screen.getByRole("button", { name: "Criar minha conta" }));
    expect(screen.getByText("CPF inválido. Confira os dígitos.")).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();

    await user.clear(cpf);
    await user.type(cpf, "52998224725");
    await user.click(screen.getByRole("button", { name: "Criar minha conta" }));
    expect(signup).toHaveBeenCalledWith({ cpf: "529.982.247-25", name: "Ana Lima" });
    // Widget de suporte desligado: sem canal na mensagem (decisão 66).
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível concluir o cadastro.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("chat");

    await user.click(screen.getByRole("button", { name: "Criar minha conta" }));
    expect(onSignedIn).toHaveBeenCalledWith(account);
  });

  describe("conflito de conta e widget de suporte (Ticket 30, decisão 66)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    async function conflictMessage(): Promise<HTMLElement> {
      const api = fakeApi({
        signup: vi.fn(async () => ({
          kind: "error" as const,
          error: { error: "account_conflict" as const },
        })),
      });
      const { user } = setup({ api, startAtSignup: true });
      await user.type(screen.getByLabelText("Nome e sobrenome"), "Ana Lima");
      await user.type(screen.getByLabelText("CPF"), "52998224725");
      await user.click(screen.getByRole("button", { name: "Criar minha conta" }));
      return screen.findByRole("alert");
    }

    it("widget ligado: orienta o chat do suporte Foode, sem wa.me", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_SRC", "https://widget.agentes.chat/loader.js");
      vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_ID", "foode-suporte");
      const alert = await conflictMessage();
      expect(alert).toHaveTextContent(
        "Não foi possível concluir o cadastro. Fale com o suporte Foode pelo chat.",
      );
      expect(alert.innerHTML).not.toContain("wa.me");
    });

    it("widget desligado (sem configuração): sem menção ao chat", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_SRC", "");
      vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_ID", "");
      const alert = await conflictMessage();
      expect(alert).toHaveTextContent("Não foi possível concluir o cadastro.");
      expect(alert).not.toHaveTextContent("chat");
    });
  });

  it("sessão com telefone verificado começa direto em nome + CPF", () => {
    setup({ startAtSignup: true });
    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
    expect(screen.queryByLabelText("WhatsApp")).not.toBeInTheDocument();
  });
});

describe("login-state", () => {
  it("máscara do CPF e contador do reenvio", () => {
    expect(formatCpfInput("529982247256")).toBe("529.982.247-25");
    expect(formatCpfInput("529")).toBe("529");
    expect(resendSecondsLeft(1000, 1000)).toBe(30);
    expect(resendSecondsLeft(1000, 31_000)).toBe(0);
    expect(validateSignup({ cpf: "529.982.247-25", name: "Ana" }).ok).toBe(true);
    expect(validateSignup({ cpf: "123", name: "" }).errors).toEqual({
      cpf: "CPF inválido. Confira os dígitos.",
      name: "Informe seu nome.",
    });
  });
});
