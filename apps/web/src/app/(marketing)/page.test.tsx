import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FAQ } from "../../content/faq";
import { LEGAL } from "../../content/site";
import MarketingLayout from "./layout";
import Home from "./page";

// Acessibilidade básica e estrutura da landing (decisão 70): landmarks, um H1, H2 por
// seção, FAQ em <details>, rodapé institucional, WhatsApp só por /falar e nada da tarifa
// de serviço do Consumidor (decisão 71).
describe("landing Foode", () => {
  it("tem landmarks, um único H1 e as seções da decisão 70", () => {
    render(
      <MarketingLayout>
        <Home />
      </MarketingLayout>,
    );
    expect(screen.getByRole("link", { name: "Pular para o conteúdo" })).toHaveAttribute(
      "href",
      "#conteudo",
    );
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Organize seu delivery, sem comissão por pedido",
    );
    expect(
      screen.getByText(
        "Cardápio digital, pedidos e pagamento online facilitado para o seu negócio",
      ),
    ).toBeInTheDocument();

    for (const name of [
      "Pare de pagar comissão no pedido de quem já é seu cliente.",
      "Quanto você deixaria de pagar por mês?",
      "Do link ao pedido em três passos.",
      "Tudo que o delivery precisa. Nada que você não vai usar.",
      "Um plano. O valor acompanha seus pedidos.",
      "Taxas do pagamento online",
      "Como a Foode se compara.",
      "Uma carta do fundador",
      "O que todo lojista pergunta antes de começar.",
      "Vamos abrir o canal próprio do seu delivery?",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });

  it("mockups reais no hero com texto alternativo, FAQ nativa e rodapé institucional", () => {
    render(
      <MarketingLayout>
        <Home />
      </MarketingLayout>,
    );
    expect(
      screen.getByRole("img", { name: /Cardápio digital da loja no celular/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Fila de pedidos do painel com três pedidos/u }),
    ).toBeInTheDocument();

    const faqSection = screen
      .getByRole("heading", { level: 2, name: "O que todo lojista pergunta antes de começar." })
      .closest("section")!;
    expect(within(faqSection).getAllByRole("group")).toHaveLength(FAQ.length);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(LEGAL.cnpj);
    expect(footer).toHaveTextContent(LEGAL.razaoSocial);
    expect(footer).toHaveTextContent(LEGAL.institucional);

    expect(screen.getByRole("link", { name: "Falar com a Foode no WhatsApp" })).toHaveAttribute(
      "href",
      "/falar",
    );
    expect(document.body.innerHTML).not.toMatch(/wa\.me/u);
    expect(document.body.innerHTML).not.toMatch(/tarifa de serviço/iu);
    expect(document.body.innerHTML).not.toContain(`R$${String.fromCharCode(0xa0)}1,50`);
  });
});
