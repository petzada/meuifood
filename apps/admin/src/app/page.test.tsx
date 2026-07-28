import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PanelShell } from "./page.js";

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
    expect(html).not.toContain("Equipe");
    expect(html).not.toContain("Configurações");
  });
});
