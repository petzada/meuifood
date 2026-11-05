// Componente: bloco do Cartão na página do Pedido (§6 Cartão, Ticket 27). Estados em
// `aria-live`, motivo do recusado e as ações: "Tentar outro cartão" (formulário inline que
// tokeniza no navegador e chama a rota de nova tentativa com `attemptKey`) e "Pagar com PIX".
import type { OrderCard } from "@foode/shared/payment";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render } from "../../../../../test/render";
import type { CardSdkFactory } from "../../finalizar/card-tokenizer";
import type { CardRetryApi } from "./card-api";
import { CardPayment } from "./card-payment";

const NOW = Date.parse("2026-11-05T15:00:00.000Z");
const tokenizer = {
  environment: "sandbox" as const,
  payeeCode: "a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8",
  sdk: "efi" as const,
};

const declined: OrderCard = {
  amountCents: 2550,
  brand: "visa",
  declineReason: "issuer_declined",
  lastFour: "4242",
  retryActions: ["other_card", "pix"],
  state: "declined",
  tokenizer,
};

function fakeSdk() {
  const tokenize = vi.fn(async () => ({
    brand: "mastercard" as const,
    lastFour: "5555",
    token: "efitokenNOVO0123456789",
  }));
  const factory: CardSdkFactory = () => ({ kind: "fields", tokenize });
  return { factory, tokenize };
}

function setup(card: OrderCard, api?: Partial<CardRetryApi>) {
  const sdk = fakeSdk();
  const retryApi: CardRetryApi = { retry: vi.fn(async () => ({ kind: "ok" as const })), ...api };
  const onRetried = vi.fn();
  const user = userEvent.setup();
  render(
    <CardPayment
      api={retryApi}
      card={card}
      customerName="Maria"
      menuHref="/loja/x"
      now={() => NOW}
      onRetried={onRetried}
      sdkFactory={sdk.factory}
      storeSlug="x"
      token="tok"
    />,
  );
  return { onRetried, retryApi, sdk, user };
}

describe("CardPayment", () => {
  it("processando, em análise e aprovado têm títulos distintos em aria-live", () => {
    const base = { ...declined, declineReason: null, retryActions: [], tokenizer: null };
    const { unmount } = render(
      <CardPayment
        card={{ ...base, state: "processing" }}
        customerName="Maria"
        menuHref="/loja/x"
        onRetried={() => undefined}
        storeSlug="x"
        token="t"
      />,
    );
    expect(screen.getByRole("heading", { name: "Processando o pagamento" })).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByText(/Visa final 4242/u)).toBeInTheDocument();
    expect(screen.getByText("R$ 25,50")).toBeInTheDocument();
    unmount();
    render(
      <CardPayment
        card={{ ...base, state: "pending" }}
        customerName="Maria"
        menuHref="/loja/x"
        onRetried={() => undefined}
        storeSlug="x"
        token="t"
      />,
    );
    expect(screen.getByRole("heading", { name: "Pagamento em análise" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("recusado: motivo exibível e as duas ações; 'Pagar com PIX' leva ao Cardápio", () => {
    setup(declined);
    expect(screen.getByRole("heading", { name: "Pagamento recusado" })).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByText(/O banco do cartão recusou o pagamento/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar outro cartão" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pagar com PIX" })).toHaveAttribute("href", "/loja/x");
    expect(screen.queryByLabelText("Número do cartão")).toBeNull();
  });

  it("só as ações do contrato aparecem (sem PIX disponível, só outro cartão)", () => {
    setup({ ...declined, retryActions: ["other_card"] });
    expect(screen.queryByRole("link", { name: "Pagar com PIX" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tentar outro cartão" })).toBeInTheDocument();
  });

  it("'Tentar outro cartão' abre o formulário, valida e envia só token + pagador com attemptKey", async () => {
    const { onRetried, retryApi, sdk, user } = setup(declined);
    await user.click(screen.getByRole("button", { name: "Tentar outro cartão" }));
    const form = screen.getByRole("form", { name: "Novo cartão" });
    await user.click(within(form).getByRole("button", { name: /^Pagar R/u }));
    expect(screen.getByLabelText("Número do cartão")).toHaveFocus();
    expect(retryApi.retry).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Número do cartão"), "5555555555554444");
    await user.type(screen.getByLabelText("Nome no cartão"), "MARIA SOUZA");
    await user.type(screen.getByLabelText("Validade"), "1230");
    await user.type(screen.getByLabelText("CVV"), "321");
    await user.type(screen.getByLabelText("CPF do titular"), "52998224725");
    await user.type(screen.getByLabelText("E-mail"), "maria@exemplo.com");
    await user.type(screen.getByLabelText("Data de nascimento do titular"), "1990-05-10");
    await user.click(within(form).getByRole("button", { name: /^Pagar R/u }));
    await waitFor(() => expect(retryApi.retry).toHaveBeenCalledTimes(1));
    expect(sdk.tokenize).toHaveBeenCalledTimes(1);
    const [slug, token, body] = vi.mocked(retryApi.retry).mock.calls[0]!;
    expect(slug).toBe("x");
    expect(token).toBe("tok");
    expect(body.attemptKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(body.card).toEqual({
      brand: "mastercard",
      lastFour: "5555",
      payer: { birthDate: "1990-05-10", cpf: "52998224725", email: "maria@exemplo.com" },
      paymentToken: "efitokenNOVO0123456789",
      sdk: "efi",
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("5555 5555");
    expect(serialized).not.toContain("321");
    expect(serialized).not.toContain("12/30");
    expect(onRetried).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("form", { name: "Novo cartão" })).toBeNull();
  });

  it("erro do contrato na nova tentativa aparece no alerta e troca a attemptKey", async () => {
    const retry = vi
      .fn<CardRetryApi["retry"]>()
      .mockResolvedValueOnce({ kind: "error", error: "attempt_active" })
      .mockResolvedValueOnce({ kind: "ok" });
    const { onRetried, user } = setup(declined, { retry });
    await user.click(screen.getByRole("button", { name: "Tentar outro cartão" }));
    await user.type(screen.getByLabelText("Número do cartão"), "5555555555554444");
    await user.type(screen.getByLabelText("Nome no cartão"), "MARIA SOUZA");
    await user.type(screen.getByLabelText("Validade"), "1230");
    await user.type(screen.getByLabelText("CVV"), "321");
    await user.type(screen.getByLabelText("CPF do titular"), "52998224725");
    await user.type(screen.getByLabelText("E-mail"), "maria@exemplo.com");
    await user.type(screen.getByLabelText("Data de nascimento do titular"), "1990-05-10");
    await user.click(screen.getByRole("button", { name: /^Pagar R/u }));
    await waitFor(() =>
      expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent(
        "Já há um pagamento em andamento para este Pedido.",
      ),
    );
    expect(onRetried).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^Pagar R/u }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
    const first = retry.mock.calls[0]![2].attemptKey;
    const second = retry.mock.calls[1]![2].attemptKey;
    expect(second).not.toBe(first);
    expect(onRetried).toHaveBeenCalledTimes(1);
  });
});
