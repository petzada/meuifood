// Componente: checkout numa tela só (X1–X9). Validações com CTA que diz o que falta, pedido
// mínimo, troco, busca pelo telefone mascarada + "Sou eu", lembrar/esquecer dados, envio
// idempotente e erros do servidor. A api do checkout entra como objeto mocado; Turnstile é
// um botão que entrega um token.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cartStorageKey } from "../storefront/cart-store";
import { ids, neighborhoodIds, publicMenu, storeState } from "../storefront/fixtures";
import type { AccountApi } from "../conta/account-api";
import { CardSdkError, type CardSdkClient, type CardSdkFactory } from "./card-tokenizer";
import { Checkout } from "./checkout";
import type { CheckoutApi } from "./checkout-api";
import { rememberedCustomerKey } from "./checkout-state";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/loja/lanchonete-do-ze/finalizar",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../../../../components/turnstile", () => ({
  Turnstile: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button onClick={() => onToken("turnstile-token")} type="button">
      Verificação de segurança
    </button>
  ),
}));

const soda4 = [{ additionalIds: [], complementSelections: {}, itemId: ids.soda, quantity: 4 }];
const soda2 = [{ additionalIds: [], complementSelections: {}, itemId: ids.soda, quantity: 2 }];

function seedCart(lines = soda4) {
  window.localStorage.setItem(
    cartStorageKey("lanchonete-do-ze"),
    JSON.stringify({ lines, storeSlug: "lanchonete-do-ze" }),
  );
}

function fakeApi(overrides: Partial<CheckoutApi> = {}): CheckoutApi {
  return {
    confirmPhone: vi.fn(async () => ({ found: false as const })),
    createOrder: vi.fn(async () => ({
      accessToken: "a".repeat(40),
      ok: true as const,
      orderCode: 12,
      replayed: false,
      trackingPath: "/loja/lanchonete-do-ze/pedido/aaaa",
    })),
    lookupPhone: vi.fn(async () => ({ found: false as const })),
    quote: vi.fn(async () => null),
    ...overrides,
  };
}

const account = {
  cpfMasked: "***.456.789-**",
  lastAddress: {
    complement: null,
    neighborhood: "Centro",
    number: "10",
    postalCode: null,
    reference: null,
    street: "Rua da Conta",
  },
  name: "Ana Lima",
  phone: "5511987654321",
};

function fakeAccountApi(overrides: Partial<AccountApi> = {}): AccountApi {
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

function setup(
  options: {
    accountApi?: AccountApi;
    api?: CheckoutApi;
    cardSdkFactory?: CardSdkFactory;
    session?: Parameters<typeof Checkout>[0]["session"];
    siteKey?: string;
    state?: typeof storeState;
  } = {},
) {
  const api = options.api ?? fakeApi();
  const accountApi = options.accountApi ?? fakeAccountApi();
  const user = userEvent.setup();
  render(
    <Checkout
      accountApi={accountApi}
      api={api}
      {...(options.cardSdkFactory ? { cardSdkFactory: options.cardSdkFactory } : {})}
      cepLookup={async () => null}
      menu={publicMenu}
      now={Date.parse("2026-11-05T23:00:00.000Z")}
      {...(options.session ? { session: options.session } : {})}
      siteKey={options.siteKey ?? ""}
      state={options.state ?? storeState}
    />,
  );
  return { accountApi, api, user };
}

const okQuote = {
  deliveryFeeCents: 0,
  discountCents: 0,
  eta: null,
  minimumOrder: null,
  ok: true as const,
  paymentMethods: ["on_delivery" as const],
  subtotalCents: 2400,
  totalCents: 2400,
};

const cta = () =>
  screen.getByRole("button", {
    name: /Fazer pedido|Preencha|Escolha|Complete|Faltam|Confira|Enviando|indisponíveis/u,
  });

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("WhatsApp"), "11912345678");
  await user.type(screen.getByLabelText("Nome e sobrenome"), "Maria Souza");
}

async function fillDelivery(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: /Delivery/u }));
  await user.type(screen.getByLabelText("Rua"), "Rua A");
  await user.type(screen.getByLabelText("Número"), "42");
  await user.selectOptions(screen.getByLabelText("Bairro"), neighborhoodIds.centro);
}

beforeEach(() => {
  window.localStorage.clear();
  router.push.mockReset();
});

describe("Checkout", () => {
  it("carrinho vazio mostra o aviso e o link para o Cardápio", async () => {
    setup();
    expect(await screen.findByText("Seu carrinho está vazio.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver Cardápio" })).toHaveAttribute(
      "href",
      "/loja/lanchonete-do-ze",
    );
  });

  it("CTA diz o que falta, fica focável e leva o foco à primeira pendência (G2)", async () => {
    seedCart();
    const { api, user } = setup();
    expect(await screen.findByText("Refrigerante lata", { exact: false })).toBeInTheDocument();
    expect(cta()).toHaveTextContent("Preencha seus dados");
    expect(cta()).toHaveAttribute("aria-disabled", "true");
    await user.click(cta());
    expect(screen.getByLabelText("WhatsApp")).toHaveFocus();
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("Confira os campos destacados.");
    expect(screen.getByText("Informe seu nome.")).toBeInTheDocument();
    expect(api.createOrder).not.toHaveBeenCalled();

    await fillBasics(user);
    expect(cta()).toHaveTextContent("Escolha como receber");
    await user.click(screen.getByRole("radio", { name: /Delivery/u }));
    expect(cta()).toHaveTextContent("Complete o endereço");
  });

  it("Delivery: taxa do bairro entra no total, mínimo bloqueia com 'Faltam R$ X' (K7/P-2.5)", async () => {
    seedCart(soda2); // R$ 12,00 < mínimo R$ 20,00
    const { user } = setup();
    await screen.findByText("Refrigerante lata", { exact: false });
    await fillBasics(user);
    await fillDelivery(user);
    expect(screen.getByRole("option", { name: "Centro · R$ 5,00" })).toBeInTheDocument();
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 17,00");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Faltam R$ 8,00 para o pedido mínimo de R$ 20,00.",
    );
    expect(cta()).toHaveTextContent("Faltam R$ 8,00 para o pedido mínimo");
    expect(cta()).toHaveAttribute("aria-disabled", "true");
    // Retirada não tem mínimo: libera.
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    expect(cta()).toHaveTextContent("Fazer pedido · R$ 12,00");
    expect(cta()).not.toHaveAttribute("aria-disabled");
  });

  it("totais vêm do servidor quando a cotação responde (G7)", async () => {
    seedCart();
    const api = fakeApi({
      quote: vi.fn(async () => ({
        deliveryFeeCents: 999,
        discountCents: 0,
        eta: { maxMinutes: 50, minMinutes: 30 },
        minimumOrder: null,
        ok: true as const,
        paymentMethods: ["on_delivery" as const, "pix" as const],
        subtotalCents: 2400,
        totalCents: 3399,
      })),
    });
    const { user } = setup({ api });
    await screen.findByText("Refrigerante lata", { exact: false });
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await waitFor(() => expect(api.quote).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 33,99"),
    );
    expect(screen.getByText(/Previsão: 30–50 min/u)).toBeInTheDocument();
    // PIX liberado pelo servidor passa a ser selecionável; Cartão segue indisponível.
    expect(screen.getByRole("radio", { name: /PIX/u })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Cartão de crédito/u })).toBeDisabled();
  });

  it("PIX em 'Pagar agora' sem incentivo; tarifa de serviço só com pagamento online (decisão 71)", async () => {
    seedCart();
    const api = fakeApi({
      quote: vi.fn(async () => ({
        ...okQuote,
        paymentMethods: ["pix" as const, "on_delivery" as const],
      })),
    });
    const { user } = setup({ api });
    await screen.findByText("Refrigerante lata", { exact: false });
    await fillBasics(user);
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /PIX/u })).toBeEnabled());
    const payNow = screen.getByRole("group", { name: "Pagar agora" });
    expect(
      within(payNow)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(["pix", "credit"]);
    expect(
      within(screen.getByRole("group", { name: "Pagar na entrega" })).getByRole("radio"),
    ).toHaveAttribute("value", "on_delivery");
    expect(screen.queryByText(/desconto|recomendado|mais rápido/iu)).toBeNull();
    expect(screen.queryByText("Tarifa de serviço (pagamento online)")).toBeNull();

    await user.click(screen.getByRole("radio", { name: /PIX/u }));
    expect(
      screen.getByText("Tarifa de serviço (pagamento online)").nextElementSibling,
    ).toHaveTextContent("R$ 1,50");
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 25,50");
    expect(cta()).toHaveTextContent("Fazer pedido · R$ 25,50");

    await user.click(screen.getByRole("radio", { name: /Pagamento na entrega/u }));
    expect(screen.queryByText("Tarifa de serviço (pagamento online)")).toBeNull();
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 24,00");
  });

  it("Pagamento na entrega: bandeiras e 'Troco para' inline validado ≥ total (P-4.2/P-4.3)", async () => {
    seedCart();
    const { api, user } = setup();
    await screen.findByText("Refrigerante lata", { exact: false });
    await fillBasics(user);
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    expect(screen.getByRole("radio", { name: /Pagamento na entrega/u })).toBeChecked();
    expect(screen.getByRole("radio", { name: /PIX/u })).toBeDisabled();
    expect(screen.getByText("Débito:").nextElementSibling).toHaveTextContent("Visa, Mastercard");
    expect(screen.getByText("Crédito:").nextElementSibling).toHaveTextContent(
      "Visa, Mastercard, Elo",
    );
    await user.type(screen.getByLabelText("Troco para"), "20");
    await user.tab();
    expect(screen.getByText("O troco precisa ser para R$ 24,00 ou mais.")).toBeInTheDocument();
    expect(cta()).toHaveTextContent("Confira o troco");
    await user.clear(screen.getByLabelText("Troco para"));
    await user.type(screen.getByLabelText("Troco para"), "50");
    expect(cta()).toHaveTextContent("Fazer pedido · R$ 24,00");
    await user.click(cta());
    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(api.createOrder).mock.calls[0]!;
    expect(body.payment).toEqual({ card: null, changeForCents: 5000, method: "on_delivery" });
  });

  it("observação com contador e limite de 200", async () => {
    seedCart();
    const { user } = setup();
    await screen.findByText("Refrigerante lata", { exact: false });
    const note = screen.getByLabelText("Alguma observação para a Loja?");
    expect(note).toHaveAttribute("maxlength", "200");
    await user.type(note, "apertar a campainha");
    expect(screen.getByText("19/200")).toBeInTheDocument();
  });

  it("envia com chave idempotente, lembra os dados, limpa o carrinho e vai ao acompanhamento", async () => {
    seedCart();
    const { api, user } = setup();
    await screen.findByText("Refrigerante lata", { exact: false });
    await fillBasics(user);
    await fillDelivery(user);
    expect(
      screen.getByRole("checkbox", { name: "Lembrar meus dados neste aparelho" }),
    ).toBeChecked();
    await user.click(cta());
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/loja/lanchonete-do-ze/pedido/aaaa"),
    );
    const [slug, body] = vi.mocked(api.createOrder).mock.calls[0]!;
    expect(slug).toBe("lanchonete-do-ze");
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(body.customer).toEqual({ name: "Maria Souza", phone: "(11) 91234-5678" });
    expect(body.address).toMatchObject({
      neighborhoodId: neighborhoodIds.centro,
      number: "42",
      street: "Rua A",
    });
    expect(JSON.stringify(body)).not.toContain("priceCents");
    expect(window.localStorage.getItem(cartStorageKey("lanchonete-do-ze"))).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem(rememberedCustomerKey("lanchonete-do-ze"))!),
    ).toMatchObject({
      address: { neighborhood: "Centro", street: "Rua A" },
      name: "Maria Souza",
      phone: "5511912345678",
    });
  });

  it("sem 'Lembrar', nada fica no aparelho", async () => {
    seedCart();
    const { user } = setup();
    await screen.findByText("Refrigerante lata", { exact: false });
    await fillBasics(user);
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await user.click(screen.getByRole("checkbox", { name: "Lembrar meus dados neste aparelho" }));
    await user.click(cta());
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(window.localStorage.getItem(rememberedCustomerKey("lanchonete-do-ze"))).toBeNull();
  });

  it("dados lembrados preenchem o formulário e 'Esquecer meus dados' apaga na hora (P-2.2)", async () => {
    seedCart();
    window.localStorage.setItem(
      rememberedCustomerKey("lanchonete-do-ze"),
      JSON.stringify({
        address: {
          complement: null,
          neighborhood: "Centro",
          number: "42",
          postalCode: null,
          reference: null,
          street: "Rua A",
        },
        name: "Maria Souza",
        phone: "5511912345678",
      }),
    );
    const { user } = setup({ siteKey: "site-key" });
    expect(await screen.findByDisplayValue("Maria Souza")).toBeInTheDocument();
    expect(screen.getByDisplayValue("(11) 91234-5678")).toBeInTheDocument();
    // Com dados no aparelho não há busca por telefone (nem Turnstile).
    expect(
      screen.queryByRole("button", { name: "Verificação de segurança" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Delivery/u }));
    expect(screen.getByLabelText("Bairro")).toHaveValue(neighborhoodIds.centro);
    await user.click(screen.getByRole("button", { name: "Esquecer meus dados" }));
    expect(window.localStorage.getItem(rememberedCustomerKey("lanchonete-do-ze"))).toBeNull();
    expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue("");
    expect(screen.getByLabelText("WhatsApp")).toHaveValue("");
  });

  it("busca pelo telefone é mascarada e só preenche depois de 'Sou eu' (P-2.1)", async () => {
    seedCart();
    const api = fakeApi({
      confirmPhone: vi.fn(async () => ({
        address: {
          complement: "ap 12",
          neighborhood: "Jardim América",
          number: "7",
          postalCode: null,
          reference: null,
          street: "Rua das Palmeiras",
        },
        customer: { name: "Maria Souza", phone: "5511912345678" },
        found: true as const,
      })),
      lookupPhone: vi.fn(async () => ({
        confirmToken: "c".repeat(40),
        found: true as const,
        masked: { firstName: "Maria", neighborhood: "Jardim América", street: "Rua das Palmeiras" },
      })),
    });
    const { user } = setup({ api, siteKey: "site-key" });
    await screen.findByText("Refrigerante lata", { exact: false });
    // Sem telefone válido o Turnstile nem aparece.
    expect(
      screen.queryByRole("button", { name: "Verificação de segurança" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("WhatsApp"), "11912345678");
    await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
    await user.click(screen.getByRole("button", { name: "Buscar meus dados" }));
    expect(api.lookupPhone).toHaveBeenCalledWith("lanchonete-do-ze", {
      phone: "(11) 91234-5678",
      turnstileToken: "turnstile-token",
    });
    const found = await screen.findByRole("group", { name: "Pedido anterior encontrado" });
    expect(found).toHaveTextContent("Maria");
    expect(found).toHaveTextContent("Rua das Palmeiras, Jardim América");
    expect(found).not.toHaveTextContent("Souza");
    expect(found).not.toHaveTextContent("7");
    // Antes do "Sou eu" o nome segue vazio.
    expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue("");
    await user.click(within(found).getByRole("button", { name: "Sou eu" }));
    expect(api.confirmPhone).toHaveBeenCalledWith("lanchonete-do-ze", "c".repeat(40));
    expect(await screen.findByDisplayValue("Maria Souza")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Delivery/u }));
    expect(screen.getByLabelText("Rua")).toHaveValue("Rua das Palmeiras");
    expect(screen.getByLabelText("Número")).toHaveValue("7");
    expect(screen.getByLabelText("Bairro")).toHaveValue(neighborhoodIds.jardim);
  });

  it("'Não sou eu' descarta a sugestão sem preencher nada", async () => {
    seedCart();
    const api = fakeApi({
      lookupPhone: vi.fn(async () => ({
        confirmToken: "c".repeat(40),
        found: true as const,
        masked: { firstName: "Maria", neighborhood: null, street: null },
      })),
    });
    const { user } = setup({ api, siteKey: "site-key" });
    await screen.findByText("Refrigerante lata", { exact: false });
    await user.type(screen.getByLabelText("WhatsApp"), "11912345678");
    await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
    await user.click(screen.getByRole("button", { name: "Buscar meus dados" }));
    await user.click(await screen.findByRole("button", { name: "Não sou eu" }));
    expect(
      screen.queryByRole("group", { name: "Pedido anterior encontrado" }),
    ).not.toBeInTheDocument();
    expect(api.confirmPhone).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue("");
  });

  it("erro do servidor fica acima do CTA com foco; carrinho e formulário são mantidos (X7)", async () => {
    seedCart();
    const api = fakeApi({
      createOrder: vi
        .fn<CheckoutApi["createOrder"]>()
        .mockResolvedValueOnce({ error: { code: "store_paused" }, ok: false })
        .mockResolvedValueOnce({ error: { code: "idempotency_conflict" }, ok: false }),
    });
    const { user } = setup({ api });
    await screen.findByText("Refrigerante lata", { exact: false });
    await fillBasics(user);
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await user.click(cta());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("A Loja pausou os pedidos agora. Seu carrinho foi mantido.");
    expect(alert).toHaveFocus();
    expect(window.localStorage.getItem(cartStorageKey("lanchonete-do-ze"))).not.toBeNull();
    expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue("Maria Souza");
    const firstKey = vi.mocked(api.createOrder).mock.calls[0]![1].idempotencyKey;
    // Retry comum reaproveita a mesma chave; só o conflito gera uma nova.
    await user.click(cta());
    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createOrder).mock.calls[1]![1].idempotencyKey).toBe(firstKey);
    expect(await screen.findByRole("alert")).toHaveTextContent("Seu pedido mudou depois do envio");
  });

  it("Loja fechada bloqueia o envio com o motivo", async () => {
    seedCart();
    const { api, user } = setup({
      state: { ...storeState, availability: { nextOpening: null, state: "closed" } },
    });
    await screen.findByText("Refrigerante lata", { exact: false });
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("A Loja está fechada agora.");
    expect(cta()).toHaveTextContent("Pedidos indisponíveis agora");
    await user.click(cta());
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it("privacidade e selo 'Ambiente seguro' aparecem acima do CTA (P-6.1/P-6.2)", async () => {
    seedCart();
    setup();
    await screen.findByText("Refrigerante lata", { exact: false });
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    expect(screen.getByText("Ambiente seguro")).toBeInTheDocument();
  });

  // ---- Ticket 13: Cupom inline (U1–U4) e conta do Consumidor (decisão 68).

  it("'Tem um cupom?' expande o campo, aplica em maiúsculas e mostra o desconto na própria tela (U1/U2)", async () => {
    seedCart();
    const quote = vi.fn(async (_slug: string, body: { couponCode?: string | null | undefined }) =>
      body.couponCode === "GANHE5"
        ? {
            ...okQuote,
            coupon: { code: "GANHE5", discountCents: 500, source: "promo" as const },
            discountCents: 500,
            totalCents: 1900,
          }
        : okQuote,
    );
    const { user } = setup({ api: fakeApi({ quote }) });
    await screen.findByText("Refrigerante lata", { exact: false });
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await waitFor(() => expect(quote).toHaveBeenCalled());
    expect(screen.queryByLabelText("Código do cupom")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tem um cupom?" }));
    await user.type(screen.getByLabelText("Código do cupom"), "ganhe 5");
    expect(screen.getByLabelText("Código do cupom")).toHaveValue("GANHE5");
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() =>
      expect(quote).toHaveBeenLastCalledWith(
        "lanchonete-do-ze",
        expect.objectContaining({ couponCode: "GANHE5" }),
      ),
    );
    const chip = await screen.findByRole("group", { name: "Cupom" });
    expect(chip).toHaveTextContent("GANHE5 aplicado · −R$ 5,00");
    expect(screen.getByText("Cupom GANHE5").nextElementSibling).toHaveTextContent("−R$ 5,00");
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 19,00");

    await user.click(within(chip).getByRole("button", { name: "Remover" }));
    await waitFor(() =>
      expect(quote).toHaveBeenLastCalledWith(
        "lanchonete-do-ze",
        expect.objectContaining({ couponCode: null }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 24,00"),
    );
  });

  it("Cupom recusado mostra o motivo do servidor inline, mantém o código e os totais sem ele (U2)", async () => {
    seedCart();
    const quote = vi.fn(async (_slug: string, body: { couponCode?: string | null | undefined }) =>
      body.couponCode
        ? {
            error: { code: "coupon_invalid" as const, reason: "expired" as const },
            ok: false as const,
          }
        : okQuote,
    );
    const { user } = setup({ api: fakeApi({ quote }) });
    await screen.findByText("Refrigerante lata", { exact: false });
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await user.click(screen.getByRole("button", { name: "Tem um cupom?" }));
    await user.type(screen.getByLabelText("Código do cupom"), "VELHO{Enter}");
    expect(await screen.findByText("Este cupom expirou.")).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Código do cupom")).toHaveValue("VELHO");
    expect(screen.getByLabelText("Código do cupom")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() =>
      expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 24,00"),
    );
  });

  it("boas-vindas entra sozinho quando elegível, com explicação e sem 'Remover' (decisão 66)", async () => {
    seedCart();
    const quote = vi.fn(async () => ({
      ...okQuote,
      coupon: { code: null, discountCents: 300, source: "welcome" as const },
      discountCents: 300,
      totalCents: 2100,
    }));
    const { user } = setup({ api: fakeApi({ quote }), session: { account, state: "signed_in" } });
    await screen.findByText("Refrigerante lata", { exact: false });
    await user.click(screen.getByRole("radio", { name: /Delivery/u }));
    const chip = await screen.findByRole("group", { name: "Cupom" });
    expect(chip).toHaveTextContent("Cupom de boas-vindas aplicado · −R$ 3,00");
    expect(chip).toHaveTextContent("primeira compra nesta Loja");
    expect(chip).toHaveTextContent("O desconto não vale para a taxa de entrega.");
    expect(within(chip).queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });

  it("Cupom que perdeu a validade no envio sai do Pedido e pede nova confirmação (U4)", async () => {
    seedCart();
    const createOrder = vi
      .fn()
      .mockResolvedValueOnce({
        error: { code: "coupon_invalid" as const, reason: "exhausted" as const },
        ok: false as const,
      })
      .mockResolvedValueOnce({
        accessToken: "a".repeat(40),
        ok: true as const,
        orderCode: 13,
        replayed: false,
        trackingPath: "/loja/lanchonete-do-ze/pedido/aaaa",
      });
    const quote = vi.fn(async (_slug: string, body: { couponCode?: string | null | undefined }) =>
      body.couponCode
        ? {
            ...okQuote,
            coupon: { code: "ULTIMO", discountCents: 500, source: "promo" as const },
            discountCents: 500,
            totalCents: 1900,
          }
        : okQuote,
    );
    const { api, user } = setup({ api: fakeApi({ createOrder, quote }) });
    await screen.findByText("Refrigerante lata", { exact: false });
    await fillBasics(user);
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await user.click(screen.getByRole("button", { name: "Tem um cupom?" }));
    await user.type(screen.getByLabelText("Código do cupom"), "ULTIMO{Enter}");
    await screen.findByRole("group", { name: "Cupom" });
    await user.click(cta());
    const alert = await screen.findByText(/Este cupom esgotou\. Confira o novo total/u);
    expect(alert).toHaveFocus();
    await waitFor(() =>
      expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 24,00"),
    );
    expect(screen.getByLabelText("Código do cupom")).toHaveValue("ULTIMO");
    await user.click(cta());
    const calls = vi.mocked(api.createOrder).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[1].couponCode).toBeNull();
    expect(calls[1]?.[1].idempotencyKey).not.toBe(calls[0]?.[1].idempotencyKey);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/loja/lanchonete-do-ze/pedido/aaaa"),
    );
  });

  it("telefone com conta Foode oferece 'Entrar com WhatsApp' e, com o código, preenche com a conta (decisão 68)", async () => {
    seedCart();
    const api = fakeApi({
      lookupPhone: vi.fn(async () => ({ found: false as const, hasAccount: true })),
    });
    const accountApi = fakeAccountApi();
    const { user } = setup({ accountApi, api, siteKey: "site-key" });
    await screen.findByText("Refrigerante lata", { exact: false });
    await user.type(screen.getByLabelText("WhatsApp"), "11987654321");
    await user.click(screen.getByRole("button", { name: "Verificação de segurança" }));
    await user.click(screen.getByRole("button", { name: "Buscar meus dados" }));
    const offer = await screen.findByRole("group", { name: "Conta Foode encontrada" });
    // Nada da conta aparece antes do código (nem mascarado).
    expect(offer).not.toHaveTextContent("Ana");
    expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue("");

    await user.click(within(offer).getByRole("button", { name: "Entrar com WhatsApp" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByLabelText("WhatsApp")).toHaveValue("(11) 98765-4321");
    await user.click(within(sheet).getByRole("button", { name: "Verificação de segurança" }));
    await user.click(within(sheet).getByRole("button", { name: "Receber código" }));
    await user.type(await within(sheet).findByLabelText("Código"), "1234");
    await user.click(within(sheet).getByRole("button", { name: "Verificação de segurança" }));
    await user.click(within(sheet).getByRole("button", { name: "Confirmar código" }));
    expect(accountApi.verifyCode).toHaveBeenCalledWith({
      code: "1234",
      phone: "(11) 98765-4321",
      turnstileToken: "turnstile-token",
    });

    const signedIn = await screen.findByRole("group", { name: "Conta Foode" });
    expect(signedIn).toHaveTextContent("Ana Lima");
    expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue("Ana Lima");
    await user.click(screen.getByRole("radio", { name: /Delivery/u }));
    expect(screen.getByLabelText("Rua")).toHaveValue("Rua da Conta");
    expect(screen.getByLabelText("Bairro")).toHaveValue(neighborhoodIds.centro);
  });

  it("sessão aberta já preenche com a conta; 'Sair' mantém o formulário e segue como Guest", async () => {
    seedCart();
    const { accountApi, user } = setup({ session: { account, state: "signed_in" } });
    await screen.findByText("Refrigerante lata", { exact: false });
    expect(await screen.findByDisplayValue("Ana Lima")).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp")).toHaveValue("(11) 98765-4321");
    await user.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(accountApi.signOut).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Entrar com WhatsApp" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome e sobrenome")).toHaveValue("Ana Lima");
  });
});

// ---- Cartão de crédito à vista (Ticket 27): campos por SDK, validação, tokenização no
// navegador e corpo só com token + pagador. SDKs entram como fábrica mocada.
const efiTokenizer = {
  environment: "sandbox" as const,
  payeeCode: "a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8",
  sdk: "efi" as const,
};
const abacateTokenizer = { publicKey: "pk_test_abc123", sdk: "abacatepay" as const };
const cardQuote = {
  ...okQuote,
  paymentMethods: ["pix" as const, "credit" as const, "on_delivery" as const],
};

type FieldsTokenize = Extract<CardSdkClient, { kind: "fields" }>["tokenize"];

function fakeSdk(overrides: { tokenize?: FieldsTokenize } = {}) {
  const tokenize = vi.fn<FieldsTokenize>(
    overrides.tokenize ??
      (async () => ({
        brand: "visa" as const,
        lastFour: "4242",
        token: "efitoken0123456789abcdef",
      })),
  );
  const hostedTokenize = vi.fn(async () => ({
    brand: null,
    lastFour: "9999",
    token: "ctok_test_abc",
  }));
  const mount = vi.fn<Extract<CardSdkClient, { kind: "hosted" }>["mount"]>(async () => ({
    destroy: vi.fn(),
    tokenize: hostedTokenize,
  }));
  const factory: CardSdkFactory = (tokenizer) =>
    tokenizer.sdk === "efi" ? { kind: "fields", tokenize } : { kind: "hosted", mount };
  return { factory, hostedTokenize, mount, tokenize };
}

async function chooseCard(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Refrigerante lata", { exact: false });
  await fillBasics(user);
  await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: /Cartão de crédito/u })).toBeEnabled(),
  );
  await user.click(screen.getByRole("radio", { name: /Cartão de crédito/u }));
}

async function fillEfiCard(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Número do cartão"), "4242424242424242");
  await user.type(screen.getByLabelText("Nome no cartão"), "MARIA SOUZA");
  await user.type(screen.getByLabelText("Validade"), "1230");
  await user.type(screen.getByLabelText("CVV"), "123");
  await user.type(screen.getByLabelText("CPF do titular"), "52998224725");
  await user.type(screen.getByLabelText("E-mail"), "maria@exemplo.com");
  await user.type(screen.getByLabelText("Data de nascimento do titular"), "1990-05-10");
}

describe("Checkout · Cartão (Ticket 27)", () => {
  it("Cartão fica indisponível sem tokenizador, mesmo com o servidor listando o meio", async () => {
    seedCart();
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({ api, state: { ...storeState, cardTokenizer: null } });
    await screen.findByText("Refrigerante lata", { exact: false });
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /PIX/u })).toBeEnabled());
    expect(screen.getByRole("radio", { name: /Cartão de crédito/u })).toBeDisabled();
    expect(screen.queryByRole("group", { name: "Cartão de crédito" })).toBeNull();
  });

  it("Efí: número, nome, validade, CVV, CPF, e-mail e nascimento; PIX não mostra nada disso", async () => {
    seedCart();
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({ api, state: { ...storeState, cardTokenizer: efiTokenizer } });
    await chooseCard(user);
    const group = screen.getByRole("group", { name: "Cartão de crédito" });
    for (const label of [
      "Número do cartão",
      "Nome no cartão",
      "Validade",
      "CVV",
      "CPF do titular",
      "E-mail",
      "Data de nascimento do titular",
    ]) {
      expect(within(group).getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(/parcel/iu)).toBeNull();
    expect(
      screen.getByText("Tarifa de serviço (pagamento online)").nextElementSibling,
    ).toHaveTextContent("R$ 1,50");
    await user.click(screen.getByRole("radio", { name: /PIX/u }));
    expect(screen.queryByRole("group", { name: "Cartão de crédito" })).toBeNull();
    expect(screen.queryByLabelText("CPF do titular")).toBeNull();
  });

  it("AbacatePay: monta os campos do provedor e pede só CPF e e-mail (sem nascimento)", async () => {
    seedCart();
    const sdk = fakeSdk();
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({
      api,
      cardSdkFactory: sdk.factory,
      state: { ...storeState, cardTokenizer: abacateTokenizer },
    });
    await chooseCard(user);
    await waitFor(() => expect(sdk.mount).toHaveBeenCalledTimes(1));
    expect(sdk.mount.mock.calls[0]![1]).toBe(2550);
    expect(screen.getByRole("group", { name: "Campos do cartão" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Número do cartão")).toBeNull();
    expect(screen.queryByLabelText("Data de nascimento do titular")).toBeNull();
    expect(screen.getByLabelText("CPF do titular")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  });

  it("validação no cliente: CTA diz o que falta e os erros são acessíveis", async () => {
    seedCart();
    const sdk = fakeSdk();
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({
      api,
      cardSdkFactory: sdk.factory,
      state: { ...storeState, cardTokenizer: efiTokenizer },
    });
    await chooseCard(user);
    expect(cta()).toHaveTextContent("Complete os dados do cartão");
    await user.click(cta());
    expect(screen.getByLabelText("Número do cartão")).toHaveFocus();
    expect(screen.getByLabelText("Número do cartão")).toHaveAccessibleDescription(
      "Informe o número do cartão.",
    );
    await user.type(screen.getByLabelText("CPF do titular"), "11111111111");
    await user.tab();
    expect(screen.getByText("Confira o CPF: o número não é válido.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(sdk.tokenize).not.toHaveBeenCalled();
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it("Efí: envia só o token e o pagador; número, validade e CVV não saem do navegador", async () => {
    seedCart();
    const sdk = fakeSdk();
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({
      api,
      cardSdkFactory: sdk.factory,
      state: { ...storeState, cardTokenizer: efiTokenizer },
    });
    await chooseCard(user);
    await fillEfiCard(user);
    expect(screen.getByLabelText("Número do cartão")).toHaveValue("4242 4242 4242 4242");
    expect(cta()).toHaveTextContent("Fazer pedido · R$ 25,50");
    await user.click(cta());
    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1));
    expect(sdk.tokenize).toHaveBeenCalledWith({
      cvv: "123",
      expirationMonth: "12",
      expirationYear: "2030",
      holderDocument: "52998224725",
      holderName: "MARIA SOUZA",
      number: "4242424242424242",
    });
    const [, body] = vi.mocked(api.createOrder).mock.calls[0]!;
    expect(body.payment).toEqual({
      card: {
        brand: "visa",
        lastFour: "4242",
        payer: { birthDate: "1990-05-10", cpf: "52998224725", email: "maria@exemplo.com" },
        paymentToken: "efitoken0123456789abcdef",
        sdk: "efi",
      },
      changeForCents: null,
      method: "credit",
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("4242 4242");
    expect(serialized).not.toContain("4242424242424242");
    expect(serialized).not.toContain('"123"');
    expect(serialized).not.toContain("12/30");
    expect(serialized).not.toContain("MARIA");
    expect(router.push).toHaveBeenCalledWith("/loja/lanchonete-do-ze/pedido/aaaa");
  });

  it("falha na tokenização mostra a mensagem no alerta e não envia o Pedido", async () => {
    seedCart();
    const sdk = fakeSdk({
      tokenize: async () => Promise.reject(new CardSdkError("card_invalid")),
    });
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({
      api,
      cardSdkFactory: sdk.factory,
      state: { ...storeState, cardTokenizer: efiTokenizer },
    });
    await chooseCard(user);
    await fillEfiCard(user);
    await user.click(cta());
    await waitFor(() =>
      expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("Confira os dados do cartão."),
    );
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  async function chooseCardSignedIn(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText("Refrigerante lata", { exact: false });
    await user.click(screen.getByRole("radio", { name: /Retirada na Loja/u }));
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Cartão de crédito/u })).toBeEnabled(),
    );
    await user.click(screen.getByRole("radio", { name: /Cartão de crédito/u }));
  }

  async function fillEfiCardWithoutCpf(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Número do cartão"), "4242424242424242");
    await user.type(screen.getByLabelText("Nome no cartão"), "MARIA SOUZA");
    await user.type(screen.getByLabelText("Validade"), "1230");
    await user.type(screen.getByLabelText("CVV"), "123");
    await user.type(screen.getByLabelText("E-mail"), "maria@exemplo.com");
    await user.type(screen.getByLabelText("Data de nascimento do titular"), "1990-05-10");
  }

  it("conta Foode (decisão 65): CPF da conta pré-escolhido; envia useAccountCpf sem cpf", async () => {
    seedCart();
    const sdk = fakeSdk();
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({
      api,
      cardSdkFactory: sdk.factory,
      session: { account, state: "signed_in" },
      state: { ...storeState, cardTokenizer: efiTokenizer },
    });
    await chooseCardSignedIn(user);
    expect(screen.getByText("CPF da sua conta", { exact: false })).toHaveTextContent(
      "CPF da sua conta ***.456.789-**",
    );
    expect(screen.queryByRole("textbox", { name: "CPF do titular" })).toBeNull();
    await fillEfiCardWithoutCpf(user);
    expect(cta()).toHaveTextContent("Fazer pedido · R$ 25,50");
    await user.click(cta());
    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1));
    expect(sdk.tokenize.mock.calls[0]![0]).not.toHaveProperty("holderDocument");
    const [, body] = vi.mocked(api.createOrder).mock.calls[0]!;
    expect(body.payment).toEqual({
      card: {
        brand: "visa",
        lastFour: "4242",
        payer: { birthDate: "1990-05-10", email: "maria@exemplo.com", useAccountCpf: true },
        paymentToken: "efitoken0123456789abcdef",
        sdk: "efi",
      },
      changeForCents: null,
      method: "credit",
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("cpf");
    expect(serialized).not.toContain("4242424242424242");
    expect(serialized).not.toContain('"123"');
    expect(serialized).not.toContain("456.789");
  });

  it("conta Foode: 'Usar outro CPF' mostra o campo e envia o CPF digitado", async () => {
    seedCart();
    const sdk = fakeSdk();
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({
      api,
      cardSdkFactory: sdk.factory,
      session: { account, state: "signed_in" },
      state: { ...storeState, cardTokenizer: efiTokenizer },
    });
    await chooseCardSignedIn(user);
    await user.click(screen.getByRole("button", { name: "Usar outro CPF" }));
    expect(screen.getByRole("textbox", { name: "CPF do titular" })).toBeInTheDocument();
    expect(cta()).toHaveTextContent("Complete os dados do cartão");
    await fillEfiCard(user);
    await user.click(cta());
    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(api.createOrder).mock.calls[0]!;
    expect(body.payment.card?.payer).toEqual({
      birthDate: "1990-05-10",
      cpf: "52998224725",
      email: "maria@exemplo.com",
    });
  });

  it("conta Foode: 422 account_cpf_unavailable volta ao CPF digitável e pede o CPF", async () => {
    seedCart();
    const sdk = fakeSdk();
    const createOrder = vi
      .fn<CheckoutApi["createOrder"]>()
      .mockResolvedValueOnce({ ok: false, error: { code: "account_cpf_unavailable" } })
      .mockResolvedValueOnce({
        accessToken: "a".repeat(40),
        ok: true,
        orderCode: 12,
        replayed: false,
        trackingPath: "/loja/lanchonete-do-ze/pedido/aaaa",
      });
    const api = fakeApi({ createOrder, quote: vi.fn(async () => cardQuote) });
    const { user } = setup({
      api,
      cardSdkFactory: sdk.factory,
      session: { account, state: "signed_in" },
      state: { ...storeState, cardTokenizer: efiTokenizer },
    });
    await chooseCardSignedIn(user);
    await fillEfiCardWithoutCpf(user);
    await user.click(cta());
    await waitFor(() =>
      expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent(
        "Não encontramos o CPF da sua conta. Digite o CPF do titular do cartão.",
      ),
    );
    const cpf = screen.getByLabelText("CPF do titular");
    await waitFor(() => expect(cpf).toHaveFocus());
    await user.type(cpf, "52998224725");
    await user.click(cta());
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));
    // Token de uso único: tokenizou de novo com chave de idempotência nova.
    expect(sdk.tokenize).toHaveBeenCalledTimes(2);
    expect(createOrder.mock.calls[1]![1].idempotencyKey).not.toBe(
      createOrder.mock.calls[0]![1].idempotencyKey,
    );
    expect(createOrder.mock.calls[1]![1].payment.card?.payer).toMatchObject({
      cpf: "52998224725",
    });
    expect(router.push).toHaveBeenCalledWith("/loja/lanchonete-do-ze/pedido/aaaa");
  });

  it("AbacatePay com conta: o CPF da conta não serve (o SDK tokeniza com o CPF no iframe)", async () => {
    seedCart();
    const sdk = fakeSdk();
    const api = fakeApi({ quote: vi.fn(async () => cardQuote) });
    const { user } = setup({
      api,
      cardSdkFactory: sdk.factory,
      session: { account, state: "signed_in" },
      state: { ...storeState, cardTokenizer: abacateTokenizer },
    });
    await chooseCardSignedIn(user);
    expect(screen.getByLabelText("CPF do titular")).toBeInTheDocument();
    expect(screen.queryByText("CPF da sua conta", { exact: false })).toBeNull();
  });
});
