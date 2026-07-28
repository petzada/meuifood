import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { foodeBrand } from "@foode/shared";

import Home from "./page.js";

describe("landing Foode", () => {
  it("renderiza a proposta e os preços vigentes pelo contrato público", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(foodeBrand.primary).toBe("#F35050");
    expect(html).toContain("Canal próprio");
    expect(html).toContain("R$ 179");
    expect(html).toContain("R$ 1.718,40");
    expect(html).toContain("20% OFF");
    expect(html).toContain('alt="Comerciante preparando um pedido em seu restaurante"');
  });
});
