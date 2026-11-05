// Componente (decisão 71): oferta de criar conta na página do Pedido. Só aparece com login
// disponível; abre o "Entrar com WhatsApp" já com o telefone lembrado deste aparelho e, ao
// entrar, consulta "meus Pedidos" da Loja (o que vincula este Pedido à conta).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountApi } from "../../conta/account-api";
import { rememberedCustomerKey } from "../../finalizar/checkout-state";
import { AccountOffer } from "./account-offer";

vi.mock("../../../../../components/turnstile", () => ({
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

function fakeApi(overrides: Partial<AccountApi> = {}): AccountApi {
  return {
    orders: vi.fn(async () => ({ kind: "ok" as const, data: { orders: [] } })),
    requestCode: vi.fn(async () => ({
      kind: "ok" as const,
      data: { expiresInSeconds: 300, ok: true as const, resendAfterSeconds: 30 },
    })),
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

afterEach(() => {
  window.localStorage.clear();
});

describe("AccountOffer", () => {
  it("sem login disponível (site key vazia) não aparece", () => {
    const { container } = render(<AccountOffer api={fakeApi()} siteKey="" storeSlug="loja" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("abre o login com o telefone lembrado e, ao entrar, vincula os Pedidos da Loja", async () => {
    window.localStorage.setItem(
      rememberedCustomerKey("loja"),
      JSON.stringify({ address: null, name: "Ana", phone: "5511987654321" }),
    );
    const api = fakeApi();
    const user = userEvent.setup();
    render(<AccountOffer api={api} siteKey="site-key" storeSlug="loja" />);
    expect(
      screen.getByText(
        "Crie sua conta pelo WhatsApp para acompanhar seus pedidos e ganhar benefícios.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Criar conta pelo WhatsApp" }));
    expect(screen.getByLabelText("WhatsApp")).toHaveValue("(11) 98765-4321");

    await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
    await user.click(screen.getByRole("button", { name: "Receber código" }));
    await user.type(await screen.findByLabelText("Código"), "1234");
    await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
    await user.click(screen.getByRole("button", { name: "Confirmar código" }));

    expect(await screen.findByText(/este pedido ficou salvo nela/u)).toBeInTheDocument();
    expect(api.orders).toHaveBeenCalledWith("loja");
    expect(screen.getByRole("heading", { name: "Olá, Ana!" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar conta pelo WhatsApp" })).toBeNull();
  });
});
