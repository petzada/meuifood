// Componente: fluxo do carrinho no Storefront (K1–K6). Abre o item pela URL (`?item=`),
// adiciona, edita pelo carrinho, muda quantidade, remove e desfaz. `next/navigation` é um
// roteador em memória; o recálculo no servidor (fetch) é mocado.
import { act, screen, within } from "@testing-library/react";

import { render } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cartStorageKey } from "./cart-store";
import { ids, publicMenu, storeState } from "./fixtures";
import { Storefront } from "./storefront";

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let params = new URLSearchParams();
  const go = (url: string) => {
    params = new URLSearchParams(url.split("?")[1] ?? "");
    for (const listener of listeners) listener();
  };
  return {
    get params() {
      return params;
    },
    reset() {
      params = new URLSearchParams();
    },
    router: {
      back: () => go(""),
      push: (url: string) => go(url),
      replace: (url: string) => go(url),
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/loja/lanchonete-do-ze",
  useRouter: () => nav.router,
  useSearchParams: () => useSyncExternalStore(nav.subscribe, () => nav.params),
}));

const fetchMock = vi.fn<typeof fetch>();
/** Barra fixa (o toast também tem um "Ver carrinho", só texto). */
const CART_BAR = /Ver carrinho\s*\d+ ite/u;

beforeEach(() => {
  nav.reset();
  window.localStorage.clear();
  // Recálculo indisponível: o Storefront segue com o subtotal local (G7).
  fetchMock.mockResolvedValue(new Response("indisponível", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const user = userEvent.setup();
  render(<Storefront menu={publicMenu} />);
  return { user };
}

async function addSoda(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Refrigerante lata/u }));
  const sheet = await screen.findByRole("dialog", { name: "Refrigerante lata" });
  await user.click(within(sheet).getByRole("button", { name: /^Adicionar · /u }));
}

function cartDialog() {
  return screen.getByRole("dialog", { name: "Carrinho" });
}

describe("Storefront: carrinho", () => {
  it("adiciona o item, avisa no toast e mostra a barra do carrinho", async () => {
    const { user } = setup();
    expect(screen.queryByRole("button", { name: CART_BAR })).not.toBeInTheDocument();

    await addSoda(user);

    expect(screen.queryByRole("dialog", { name: "Refrigerante lata" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent(
      "Refrigerante lata adicionado ao carrinho",
    );
    const bar = screen.getByRole("button", { name: /Ver carrinho\s*1 item · R\$\s6,00/u });
    expect(bar).toBeVisible();
    expect(
      JSON.parse(window.localStorage.getItem(cartStorageKey("lanchonete-do-ze")) ?? "{}"),
    ).toMatchObject({ lines: [{ itemId: ids.soda, quantity: 1 }] });
  });

  it("muda a quantidade no carrinho e recalcula o subtotal na hora", async () => {
    const { user } = setup();
    await addSoda(user);
    await user.click(screen.getByRole("button", { name: /Ver carrinho\s*1 item/u }));

    const cart = cartDialog();
    const line = within(cart).getByRole("group", { name: "Quantidade de Refrigerante lata" });
    await user.click(within(line).getByRole("button", { name: "Aumentar quantidade" }));

    expect(within(cart).getByText("2×")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ver carrinho\s*2 itens · R\$\s12,00/u }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/loja/lanchonete-do-ze/carrinho",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("remove pela lixeira e o Desfazer devolve a linha", async () => {
    const { user } = setup();
    await addSoda(user);
    await user.click(screen.getByRole("button", { name: CART_BAR }));

    await user.click(
      within(cartDialog()).getByRole("button", { name: "Remover Refrigerante lata" }),
    );

    expect(within(cartDialog()).getByText("Seu carrinho está vazio.")).toBeInTheDocument();
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent("Refrigerante lata removido");

    await user.click(screen.getByRole("button", { name: "Desfazer" }));

    expect(
      within(cartDialog()).getByText("Refrigerante lata", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver carrinho\s*1 item/u })).toBeVisible();
  });

  it("edita a linha pelo carrinho: reabre as escolhas e substitui em vez de somar", async () => {
    const { user } = setup();
    // X-Burger aparece nos Destaques e na categoria: abre pela URL compartilhável.
    act(() => nav.router.push(`/loja/lanchonete-do-ze?item=${ids.burger}`));
    let sheet = await screen.findByRole("dialog", { name: "X-Burger" });
    await user.click(within(sheet).getByRole("radio", { name: /Mal passado/u }));
    await user.click(within(sheet).getByRole("button", { name: /^Adicionar · R\$\s25,00$/u }));

    await user.click(screen.getByRole("button", { name: CART_BAR }));
    expect(within(cartDialog()).getByText("Ponto da carne: Mal passado")).toBeInTheDocument();
    await user.click(within(cartDialog()).getByRole("button", { name: "Editar" }));

    sheet = await screen.findByRole("dialog", { name: "X-Burger" });
    expect(within(sheet).getByRole("radio", { name: /Mal passado/u })).toBeChecked();
    await user.click(within(sheet).getByRole("radio", { name: /Ao ponto/u }));
    await user.click(within(sheet).getByRole("button", { name: /^Salvar · R\$\s25,00$/u }));

    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent("X-Burger atualizado");
    const cart = cartDialog();
    expect(within(cart).getByText("Ponto da carne: Ao ponto")).toBeInTheDocument();
    expect(within(cart).queryByText("Ponto da carne: Mal passado")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ver carrinho\s*1 item · R\$\s25,00/u }),
    ).toBeVisible();
  });

  it("usa o subtotal do servidor quando o recálculo responde", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        lines: [{ itemId: ids.soda, subtotalCents: 650 }],
        ok: true,
        subtotalCents: 650,
      }),
    );
    const { user } = setup();
    await addSoda(user);
    await user.click(screen.getByRole("button", { name: CART_BAR }));

    expect((await within(cartDialog()).findAllByText(/R\$\s6,50/u)).length).toBeGreaterThan(0);
  });
});

describe("Storefront: estado da Loja e checkout (24a)", () => {
  const NOW = Date.parse("2026-11-05T23:00:00.000Z");

  function setupWithState(state = storeState) {
    const user = userEvent.setup();
    render(<Storefront menu={publicMenu} now={NOW} state={state} />);
    return { user };
  }

  it("sem estado (api indisponível) o Cardápio abre sem linha de estado nem 'Sobre a Loja'", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Sobre a Loja" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Aberta até/u)).not.toBeInTheDocument();
  });

  it("aberta: linha de estado e sheet 'Sobre a Loja' com horários, endereço, mínimo e bandeiras", async () => {
    const { user } = setupWithState({
      ...storeState,
      availability: { closesAt: "2026-11-06T02:00:00.000Z", state: "open" },
    });
    expect(screen.getByText("Aberta até 23:00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sobre a Loja" }));
    const sheet = await screen.findByRole("dialog", { name: "Lanchonete do Zé" });
    expect(within(sheet).getByText("Sexta").nextElementSibling).toHaveTextContent(
      "11:00–14:00 · 18:00–23:00",
    );
    expect(within(sheet).getByText("Terça").nextElementSibling).toHaveTextContent("Fechado");
    expect(within(sheet).getByText("Rua das Flores, 100")).toBeInTheDocument();
    expect(within(sheet).getByText(/pedido mínimo R\$\s20,00/u)).toBeInTheDocument();
    expect(within(sheet).getByText("Pagamento na entrega")).toBeInTheDocument();
    expect(within(sheet).getByText("Débito:").parentElement).toHaveTextContent("Visa, Mastercard");
    await user.click(within(sheet).getByRole("button", { name: "Fechar" }));
  });

  it("endereço da Loja só aparece com Retirada ativa (P-3.3)", async () => {
    const { user } = setupWithState({ ...storeState, pickup: null });
    await user.click(screen.getByRole("button", { name: "Sobre a Loja" }));
    const sheet = await screen.findByRole("dialog", { name: "Lanchonete do Zé" });
    expect(within(sheet).queryByText("Rua das Flores, 100")).not.toBeInTheDocument();
    expect(within(sheet).queryByText("Retirada na Loja")).not.toBeInTheDocument();
  });

  it("carrinho: CTA leva ao checkout e avisa o mínimo do Delivery (K7)", async () => {
    const { user } = setupWithState();
    await addSoda(user);
    await user.click(screen.getByRole("button", { name: CART_BAR }));
    const cart = cartDialog();
    expect(within(cart).queryByText(/próxima etapa/u)).not.toBeInTheDocument();
    expect(within(cart).getByRole("link", { name: /Finalizar pedido/u })).toHaveAttribute(
      "href",
      "/loja/lanchonete-do-ze/finalizar",
    );
    expect(within(cart).getByRole("status")).toHaveTextContent(
      "Faltam R$ 14,00 para o pedido mínimo de R$ 20,00 no Delivery.",
    );
  });

  it("fechada ou em Pausa: Cardápio visível, estado distinto e checkout bloqueado (decisão 41)", async () => {
    const { user } = setupWithState({ ...storeState, availability: { state: "paused" } });
    expect(screen.getByText("Em pausa · pedidos voltam em breve")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /X-Burger/u }).length).toBeGreaterThan(0);
    await addSoda(user);
    await user.click(screen.getByRole("button", { name: CART_BAR }));
    const cart = cartDialog();
    expect(within(cart).queryByRole("link", { name: /Finalizar pedido/u })).not.toBeInTheDocument();
    expect(
      within(cart).getByRole("button", { name: "Pedidos indisponíveis agora" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(within(cart).getByRole("status")).toHaveTextContent(/pausou os pedidos/u);
  });

  it("fechada mostra o próximo horário", () => {
    setupWithState({
      ...storeState,
      availability: {
        nextOpening: { at: "2026-11-06T14:00:00.000Z", opensAt: "11:00", weekday: 5 },
        state: "closed",
      },
    });
    expect(screen.getByText("Fechada · abre amanhã às 11:00")).toBeInTheDocument();
  });
});
