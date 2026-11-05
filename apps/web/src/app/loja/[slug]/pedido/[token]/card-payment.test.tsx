// Componente: bloco do Cartão na página do Pedido (§6 Cartão, Ticket 27). Estados em
// `aria-live`, motivo do recusado e as ações: "Tentar outro cartão" (formulário inline que
// tokeniza no navegador e chama a rota de nova tentativa com `attemptKey`) e "Pagar com PIX"
// (troca o Pedido para PIX na mesma página). CPF da conta (decisão 65): pré-escolhido na Efí com
// `useAccountCpf: true` e sem `cpf` no corpo; "Usar outro CPF" e o 422 voltam ao campo digitável.
import type { OrderCard } from "@foode/shared/payment";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render } from "../../../../../test/render";
import type { CardSdkClient, CardSdkFactory } from "../../finalizar/card-tokenizer";
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

type FieldsTokenize = Extract<CardSdkClient, { kind: "fields" }>["tokenize"];

function fakeSdk() {
  const tokenize = vi.fn<FieldsTokenize>(async () => ({
    brand: "mastercard" as const,
    lastFour: "5555",
    token: "efitokenNOVO0123456789",
  }));
  const factory: CardSdkFactory = () => ({ kind: "fields", tokenize });
  return { factory, tokenize };
}

function setup(
  card: OrderCard,
  api?: Partial<CardRetryApi>,
  options: { cpfMasked?: string | null; onPixSwitched?: () => Promise<boolean> } = {},
) {
  const sdk = fakeSdk();
  const retryApi: CardRetryApi = {
    payWithPix: vi.fn(async () => ({ kind: "ok" as const })),
    retry: vi.fn(async () => ({ kind: "ok" as const })),
    ...api,
  };
  const onRetried = vi.fn();
  const onPixSwitched = options.onPixSwitched ?? vi.fn(async () => true);
  const user = userEvent.setup();
  render(
    <CardPayment
      api={retryApi}
      card={card}
      cpfMasked={options.cpfMasked ?? null}
      customerName="Maria"
      now={() => NOW}
      onPixSwitched={onPixSwitched}
      onRetried={onRetried}
      sdkFactory={sdk.factory}
      storeSlug="x"
      token="tok"
    />,
  );
  return { onPixSwitched, onRetried, retryApi, sdk, user };
}

async function fillNewCard(user: ReturnType<typeof userEvent.setup>, withCpf = true) {
  await user.type(screen.getByLabelText("Número do cartão"), "5555555555554444");
  await user.type(screen.getByLabelText("Nome no cartão"), "MARIA SOUZA");
  await user.type(screen.getByLabelText("Validade"), "1230");
  await user.type(screen.getByLabelText("CVV"), "321");
  if (withCpf) await user.type(screen.getByLabelText("CPF do titular"), "52998224725");
  await user.type(screen.getByLabelText("E-mail"), "maria@exemplo.com");
  await user.type(screen.getByLabelText("Data de nascimento do titular"), "1990-05-10");
}

describe("CardPayment", () => {
  it("processando, em análise e aprovado têm títulos distintos em aria-live", () => {
    const base = { ...declined, declineReason: null, retryActions: [], tokenizer: null };
    const { unmount } = render(
      <CardPayment
        card={{ ...base, state: "processing" }}
        customerName="Maria"
        onPixSwitched={async () => true}
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
        onPixSwitched={async () => true}
        onRetried={() => undefined}
        storeSlug="x"
        token="t"
      />,
    );
    expect(screen.getByRole("heading", { name: "Pagamento em análise" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("recusado: motivo exibível e as duas ações do contrato", () => {
    setup(declined);
    expect(screen.getByRole("heading", { name: "Pagamento recusado" })).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByText(/O banco do cartão recusou o pagamento/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar outro cartão" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar com PIX" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pagar com PIX" })).toBeNull();
    expect(screen.queryByLabelText("Número do cartão")).toBeNull();
  });

  it("só as ações do contrato aparecem (sem PIX disponível, só outro cartão)", () => {
    setup({ ...declined, retryActions: ["other_card"] });
    expect(screen.queryByRole("button", { name: "Pagar com PIX" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tentar outro cartão" })).toBeInTheDocument();
  });

  it("Pagar com PIX chama a rota de troca sem refazer o pedido e a página recarrega o Pedido", async () => {
    const onPixSwitched = vi.fn(async () => true);
    const { retryApi, user } = setup(declined, {}, { onPixSwitched });
    await user.click(screen.getByRole("button", { name: "Pagar com PIX" }));
    await waitFor(() => expect(onPixSwitched).toHaveBeenCalledTimes(1));
    expect(retryApi.payWithPix).toHaveBeenCalledWith("x", "tok");
    expect(retryApi.retry).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Pagar com PIX: erro do contrato vira alerta; sem recarregar, pede para atualizar", async () => {
    const payWithPix = vi
      .fn<CardRetryApi["payWithPix"]>()
      .mockResolvedValueOnce({ kind: "error", error: "payment_method_unavailable" })
      .mockResolvedValueOnce({ kind: "ok" });
    const onPixSwitched = vi.fn(async () => false);
    const { user } = setup(declined, { payWithPix }, { onPixSwitched });
    await user.click(screen.getByRole("button", { name: "Pagar com PIX" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("O PIX ficou indisponível nesta Loja"),
    );
    expect(onPixSwitched).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Pagar com PIX" }));
    await waitFor(() => expect(onPixSwitched).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Trocamos para PIX. Atualize a página");
    expect(screen.getByRole("button", { name: "Pagar com PIX" })).toBeDisabled();
  });

  it("conta com CPF (decisão 65): envia useAccountCpf sem cpf; Usar outro CPF volta ao campo", async () => {
    const { retryApi, sdk, user } = setup(declined, {}, { cpfMasked: "***.456.789-**" });
    await user.click(screen.getByRole("button", { name: "Tentar outro cartão" }));
    expect(screen.getByText("CPF da sua conta", { exact: false })).toHaveTextContent(
      "CPF da sua conta ***.456.789-**",
    );
    expect(screen.queryByRole("textbox", { name: "CPF do titular" })).toBeNull();
    await fillNewCard(user, false);
    await user.click(screen.getByRole("button", { name: /^Pagar R/u }));
    await waitFor(() => expect(retryApi.retry).toHaveBeenCalledTimes(1));
    const body = vi.mocked(retryApi.retry).mock.calls[0]![2];
    expect(body.card.payer).toEqual({
      birthDate: "1990-05-10",
      email: "maria@exemplo.com",
      useAccountCpf: true,
    });
    expect("cpf" in body.card.payer).toBe(false);
    expect(sdk.tokenize.mock.calls[0]![0]).not.toHaveProperty("holderDocument");
    const serialized = JSON.stringify(body.card);
    expect(serialized).not.toContain("5555 5555");
    expect(serialized).not.toContain("321");
    expect(serialized).not.toContain("456.789");

    // Formulário de novo (outra recusa): "Usar outro CPF" mostra o campo e passa a exigi-lo.
    await user.click(screen.getByRole("button", { name: "Tentar outro cartão" }));
    await user.click(screen.getByRole("button", { name: "Usar outro CPF" }));
    expect(screen.getByRole("textbox", { name: "CPF do titular" })).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Usar o CPF da minha conta (***.456.789-**)" }),
    );
    expect(screen.queryByRole("textbox", { name: "CPF do titular" })).toBeNull();
  });

  it("422 account_cpf_unavailable volta ao CPF digitável com a mensagem", async () => {
    const retry = vi
      .fn<CardRetryApi["retry"]>()
      .mockResolvedValueOnce({ kind: "error", error: "account_cpf_unavailable" })
      .mockResolvedValueOnce({ kind: "ok" });
    const { onRetried, user } = setup(declined, { retry }, { cpfMasked: "***.456.789-**" });
    await user.click(screen.getByRole("button", { name: "Tentar outro cartão" }));
    await fillNewCard(user, false);
    await user.click(screen.getByRole("button", { name: /^Pagar R/u }));
    await waitFor(() =>
      expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent(
        "Não encontramos o CPF da sua conta. Digite o CPF do titular do cartão.",
      ),
    );
    const cpf = screen.getByLabelText("CPF do titular");
    await waitFor(() => expect(cpf).toHaveFocus());
    await user.type(cpf, "52998224725");
    await user.click(screen.getByRole("button", { name: /^Pagar R/u }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
    expect(retry.mock.calls[1]![2].card.payer).toMatchObject({ cpf: "52998224725" });
    expect("useAccountCpf" in retry.mock.calls[1]![2].card.payer).toBe(false);
    expect(onRetried).toHaveBeenCalledTimes(1);
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
    // Só o cartão: o `attemptKey` é aleatório e pode conter qualquer sequência de dígitos.
    const serialized = JSON.stringify(body.card);
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
