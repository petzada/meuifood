// Moldura do Painel (feedback do Dono, itens 2–4): destaque do menu segue a navegação
// client-side, Sair vira ícone vermelho com nome "Sair" e o Dono vê o banner do Plano.
import type { SessionCtx } from "@foode/shared/auth";
import type { OwnerPlanView } from "@foode/shared/onboarding";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "../test/render";
import { PainelShell } from "./painel-shell";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const store = (role: "owner" | "operator"): SessionCtx["stores"][number] => ({
  id: "a",
  slug: "a",
  name: "Loja A",
  status: "active",
  role,
});

function session(role: "owner" | "operator"): SessionCtx {
  return {
    user: { id: "u1", email: "dono@example.com", name: "Marcio", platformRole: null },
    sessionExpiresAt: "2030-01-01T00:00:00.000Z",
    activeStore: store(role),
    stores: [store(role)],
  };
}

const PLAN: OwnerPlanView = {
  month: "2026-11",
  orderCount: 128,
  plan: { cycle: "monthly", validFrom: "2026-11-01T03:00:00.000Z", validTo: null },
  tier: { minOrders: 0, maxOrders: 150, priceCents: 8499 },
};

beforeEach(() => {
  navigation.pathname = "/";
});

describe("navegação do Painel", () => {
  it("o item ativo acompanha o pathname sem recarregar o layout", () => {
    const { rerender } = render(
      <PainelShell currentPath="/" role="owner" session={session("owner")}>
        <p>conteúdo</p>
      </PainelShell>,
    );
    const nav = screen.getByRole("navigation", { name: "Navegação do Painel" });
    expect(within(nav).getByRole("link", { name: "Pedidos" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Navegação client-side: o layout não re-renderiza com outro `currentPath`.
    navigation.pathname = "/cardapio/itens/novo";
    rerender(
      <PainelShell currentPath="/" role="owner" session={session("owner")}>
        <p>outra página</p>
      </PainelShell>,
    );
    expect(within(nav).getByRole("link", { name: "Cardápio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Pedidos" })).not.toHaveAttribute("aria-current");
  });

  it("Sair é um ícone no lugar de antes, com nome acessível", () => {
    render(
      <PainelShell currentPath="/" role="owner" session={session("owner")}>
        <p>conteúdo</p>
      </PainelShell>,
    );
    const signOut = screen.getByRole("button", { name: "Sair" });
    expect(signOut).not.toHaveTextContent("Sair");
    expect(signOut.closest("div")).toHaveTextContent("Marcio");
  });

  it("Dono vê o banner do Plano com a barra e 'Ver meu plano'; Operador não", () => {
    const { unmount } = render(
      <PainelShell currentPath="/" plan={PLAN} role="owner" session={session("owner")}>
        <p>conteúdo</p>
      </PainelShell>,
    );
    const banner = screen.getByRole("region", { name: "Seu Plano" });
    expect(within(banner).getByText("128 de 150 Pedidos")).toBeInTheDocument();
    expect(within(banner).getByText("Faixa até 150 Pedidos")).toBeInTheDocument();
    expect(within(banner).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "85");
    expect(within(banner).getByRole("link", { name: "Ver meu plano" })).toHaveAttribute(
      "href",
      "/plano",
    );
    unmount();

    render(
      <PainelShell currentPath="/" plan={PLAN} role="operator" session={session("operator")}>
        <p>conteúdo</p>
      </PainelShell>,
    );
    expect(screen.queryByRole("region", { name: "Seu Plano" })).not.toBeInTheDocument();
  });
});
