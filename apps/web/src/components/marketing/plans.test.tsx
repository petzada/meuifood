import { PLAN_TIERS_SEED } from "@foode/shared/ops";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ANNUAL_DISCOUNT_PERCENT,
  ANNUAL_INSTALLMENT_CENTS,
  formatBRL as formatBRLNbsp,
} from "../../content/pricing";
import { REFUND_LINE } from "../../content/site";
import { Plans } from "./plans";

/** Texto como o Testing Library normaliza (NBSP vira espaço). */
const formatBRL = (cents: number) =>
  formatBRLNbsp(cents).replaceAll(String.fromCharCode(0xa0), " ");

describe("Plans (decisões 61, 70, 71 + ajustes do Dono)", () => {
  it("mostra as 3 faixas, 'Você começa aqui' fora do card e o reembolso sob cada botão", () => {
    render(<Plans />);
    const monthly = screen.getByRole("article", { name: "Mensal" });
    for (const tier of PLAN_TIERS_SEED.monthlyTiers) {
      expect(
        within(monthly).getByText(formatBRL(tier.priceCents), { exact: false }),
      ).toBeInTheDocument();
    }
    const start = screen.getByText("Você começa aqui");
    expect(start.closest("article")).toBeNull();
    expect(screen.getAllByText(REFUND_LINE)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Falar com a Foode" })).toHaveLength(2);
    // Nada de "+ taxas" nos cards nem a tarifa de serviço do Consumidor (decisão 71).
    expect(screen.queryByText(/\+ taxas/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,50/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/tarifa/iu)).not.toBeInTheDocument();
  });

  it("Anual: '6×' em cima, parcela com mais peso embaixo, à vista sem destaque e badge amarela", () => {
    render(<Plans />);
    const annual = screen.getByRole("article", { name: "Anual" });
    expect(within(annual).getByText("Pedidos ilimitados por um valor fixo.")).toBeInTheDocument();

    const installment = within(annual).getByTestId("annual-installment");
    const [times, value] = Array.from(installment.children);
    expect(times).toHaveTextContent("6×");
    expect(value).toHaveTextContent(formatBRL(ANNUAL_INSTALLMENT_CENTS));
    expect(value).toHaveTextContent("R$ 188,20");
    expect(value!.className).toContain("text-[2.25rem]");
    expect(times!.className).toContain("text-lg");

    expect(within(annual).getByTestId("annual-total")).toHaveTextContent(
      `ou ${formatBRL(PLAN_TIERS_SEED.annualPriceCents)} à vista`,
    );
    expect(within(annual).getByTestId("annual-total")).toHaveTextContent("R$ 1.019,88");

    const badge = within(annual).getByTestId("annual-badge");
    expect(badge).toHaveTextContent(`${ANNUAL_DISCOUNT_PERCENT}% de desconto`);
    expect(badge).toHaveTextContent("66% de desconto");
    expect(badge.className).toContain("mk-plan__badge");
    expect(within(annual).queryByText(/em relação a 12 mensalidades/u)).not.toBeInTheDocument();
    expect(within(annual).queryByText(/12×/u)).not.toBeInTheDocument();
    // Benefícios exclusivos em negrito.
    expect(within(annual).getByText("Pedidos ilimitados o ano inteiro").tagName).toBe("STRONG");
  });
});
