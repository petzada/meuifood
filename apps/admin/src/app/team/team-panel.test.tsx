import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeamPanel } from "./team-panel.js";

describe("painel de Equipe", () => {
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
