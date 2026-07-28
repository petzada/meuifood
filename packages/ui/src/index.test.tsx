import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, OutlineContainer } from "./index.js";

describe("contratos públicos de UI", () => {
  it("renderiza CTA navegável e container sem esconder o conteúdo", () => {
    const html = renderToStaticMarkup(
      <OutlineContainer as="section" aria-label="Plano Foode">
        <Button href="#precos">Conhecer o plano</Button>
      </OutlineContainer>,
    );

    expect(html).toContain("<section");
    expect(html).toContain('aria-label="Plano Foode"');
    expect(html).toContain('<a href="#precos"');
    expect(html).toContain("Conhecer o plano");
  });
});
