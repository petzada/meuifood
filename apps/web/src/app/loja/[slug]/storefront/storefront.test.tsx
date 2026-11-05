// Componente: fluxo do carrinho no Storefront (K1–K6). Abre o item pela URL (`?item=`),
// adiciona, edita pelo carrinho, muda quantidade, remove e desfaz. `next/navigation` é um
// roteador em memória; o recálculo no servidor (fetch) é mocado.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cartStorageKey } from "./cart-store";
import { ids, publicMenu } from "./fixtures";
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
    expect(screen.getByRole("status")).toHaveTextContent("Refrigerante lata adicionado");
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
    expect(screen.getByRole("status")).toHaveTextContent("Refrigerante lata removido");

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

    expect(screen.getByRole("status")).toHaveTextContent("X-Burger atualizado");
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

    expect(await within(cartDialog()).findByText(/R\$\s6,50/u)).toBeInTheDocument();
  });
});
