import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PanelShell, TeamPanel } from "./page.js";

describe("shell do Painel", () => {
  it("renderiza a entrada da operação com navegação observável", () => {
    const html = renderToStaticMarkup(<PanelShell role="owner" />);

    expect(html).toContain("Painel Foode");
    expect(html).toContain("Pedidos");
    expect(html).toContain("A operação da sua Loja começa aqui.");
  });

  it("oculta áreas restritas para o Operador", () => {
    const html = renderToStaticMarkup(<PanelShell role="operator" />);

    expect(html).toContain("Pedidos");
    expect(html).not.toContain("Cardápio");
    expect(html).not.toContain("Funcionamento");
    expect(html).not.toContain("Equipe");
    expect(html).not.toContain("Configurações");
  });

  it("oferece ao Dono a âncora de Cardápio na navegação", () => {
    const html = renderToStaticMarkup(<PanelShell role="owner" />);

    expect(html).toContain("Cardápio");
    expect(html).toContain("#cardapio");
    expect(html).toContain("Funcionamento");
    expect(html).toContain("#funcionamento");
  });

  it("oferece ao Dono a gestão funcional da Equipe", () => {
    const html = renderToStaticMarkup(
      <TeamPanel
        feedback="convite-enviado"
        members={[
          {
            email: "dono@example.com",
            id: "membership-owner",
            role: "owner",
            userId: "user-owner",
          },
          {
            email: "operador@example.com",
            id: "membership-operator",
            role: "operator",
            userId: "user-operator",
          },
        ]}
      />,
    );

    expect(html).toContain("Convidar Operador");
    expect(html).toContain("dono@example.com");
    expect(html).toContain("operador@example.com");
    expect(html).toContain("Remover acesso");
    expect(html).toContain("Convite enviado");
  });
});
