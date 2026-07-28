import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AdminHome from "./page.js";

describe("shell do Painel", () => {
  it("renderiza a entrada da operação com navegação observável", () => {
    const html = renderToStaticMarkup(<AdminHome />);

    expect(html).toContain("Painel Foode");
    expect(html).toContain("Pedidos");
    expect(html).toContain("A operação da sua Loja começa aqui.");
  });
});
