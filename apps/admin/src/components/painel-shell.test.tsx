import type { SessionCtx } from "@foode/shared/auth";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PainelShell } from "./painel-shell";

const store = (role: "owner" | "operator", id: string): SessionCtx["stores"][number] => ({
  id,
  slug: id,
  name: `Loja ${id}`,
  status: "active",
  role,
});

function session(
  stores: SessionCtx["stores"],
  platformRole: "foode_ops" | null = null,
): SessionCtx {
  return {
    user: { id: "u1", email: "dono@example.com", name: "Marcio", platformRole },
    sessionExpiresAt: "2030-01-01T00:00:00.000Z",
    activeStore: stores[0] ?? null,
    stores,
  };
}

const noop = async () => undefined;

describe("shell do Painel", () => {
  it("Dono vê toda a navegação da Loja e a Loja ativa", () => {
    const html = renderToStaticMarkup(
      <PainelShell
        currentPath="/"
        role="owner"
        session={session([store("owner", "a")])}
        switchStore={noop}
      >
        <p>conteúdo</p>
      </PainelShell>,
    );
    expect(html).toContain("Painel Foode");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Pedidos");
    expect(html).toContain("Cardápio");
    expect(html).toContain("Equipe");
    expect(html).toContain("Configurações");
    expect(html).not.toContain('href="/ops"');
    expect(html).toContain("Loja a");
    expect(html).not.toContain("<select");
    expect(html).toContain("Sair");
  });

  it("Operador só vê Pedidos, sem vazar as outras áreas", () => {
    const html = renderToStaticMarkup(
      <PainelShell currentPath="/" role="operator" session={session([store("operator", "a")])}>
        <p>conteúdo</p>
      </PainelShell>,
    );
    expect(html).toContain("Pedidos");
    expect(html).not.toContain("Cardápio");
    expect(html).not.toContain("Equipe");
    expect(html).not.toContain("/configuracoes");
    expect(html).toContain("Operador");
  });

  it("Ops só vê /ops", () => {
    const html = renderToStaticMarkup(
      <PainelShell currentPath="/ops" role="foode_ops" session={session([], "foode_ops")}>
        <p>conteúdo</p>
      </PainelShell>,
    );
    expect(html).toContain('href="/ops"');
    expect(html).not.toContain("Pedidos");
    expect(html).toContain("Área Ops");
  });

  it("usuário com várias Lojas ganha o seletor com a ativa marcada", () => {
    const html = renderToStaticMarkup(
      <PainelShell
        currentPath="/"
        role="owner"
        session={session([store("owner", "a"), store("operator", "b")])}
        switchStore={noop}
      >
        <p>conteúdo</p>
      </PainelShell>,
    );
    expect(html).toContain("<select");
    expect(html).toContain('name="storeId"');
    expect(html).toContain("Loja a");
    expect(html).toContain("Loja b");
    expect(html).toContain("Loja ativa");
  });
});
