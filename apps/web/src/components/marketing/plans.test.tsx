import { PLAN_TIERS_SEED } from "@foode/shared/ops";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ANNUAL_DISCOUNT_PERCENT, formatBRL as formatBRLNbsp } from "../../content/pricing";
import { REFUND_LINE } from "../../content/site";
import { Plans } from "./plans";

/** Texto como o Testing Library normaliza (NBSP vira espaço). */
const formatBRL = (cents: number) =>
  formatBRLNbsp(cents).replaceAll(String.fromCharCode(0xa0), " ");

describe("Plans (decisões 61, 70, 71)", () => {
  it("mostra as 3 faixas do contrato, o selo e o reembolso sob cada botão", () => {
    render(<Plans />);
    const monthly = screen.getByRole("article", { name: "Mensal" });
    for (const tier of PLAN_TIERS_SEED.monthlyTiers) {
      expect(
        within(monthly).getByText(formatBRL(tier.priceCents), { exact: false }),
      ).toBeInTheDocument();
    }
    expect(within(monthly).getByText("Você começa aqui")).toBeInTheDocument();
    expect(screen.getAllByText(REFUND_LINE)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Falar com a Foode" })).toHaveLength(2);
    // A tarifa de serviço do Consumidor nunca aparece nos planos (decisão 71).
    expect(screen.queryByText(/1,50/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/tarifa/iu)).not.toBeInTheDocument();
  });

  it("Anual: 6× de R$ 188,20 em destaque, total à vista abaixo e badge com a % real", () => {
    render(<Plans />);
    const annual = screen.getByRole("article", { name: "Anual" });
    expect(within(annual).getByTestId("annual-installment")).toHaveTextContent(
      `6× de ${formatBRL(18820)}`,
    );
    expect(within(annual).getByTestId("annual-total")).toHaveTextContent(
      `${formatBRL(PLAN_TIERS_SEED.annualPriceCents)}/ano`,
    );
    expect(within(annual).getByText(`${ANNUAL_DISCOUNT_PERCENT}% de desconto`)).toBeInTheDocument();
    expect(within(annual).queryByText(/12×/u)).not.toBeInTheDocument();
    // Benefícios exclusivos em negrito.
    expect(within(annual).getByText("Pedidos ilimitados o ano inteiro").tagName).toBe("STRONG");
  });
});
