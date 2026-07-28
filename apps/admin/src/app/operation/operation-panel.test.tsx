import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OperationPanel } from "./operation-panel.js";

describe("gestão de funcionamento", () => {
  it("mostra os sete dias, períodos existentes e controle de Pausa", () => {
    const html = renderToStaticMarkup(
      <OperationPanel
        operation={{
          paused: true,
          periods: [
            { weekday: 1, opensAt: "11:00", closesAt: "14:00" },
          ],
        }}
      />,
    );

    expect(html).toContain("Funcionamento");
    expect(html).toContain("Segunda-feira");
    expect(html).toContain("Domingo");
    expect(html).toContain('value="11:00"');
    expect(html).toContain('value="14:00"');
    expect(html).toContain("Loja em Pausa");
    expect(html).toContain("Retomar checkout");
  });
});
