import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { formatBRL as formatBRLNbsp } from "../../content/pricing";
import { Calculator } from "./calculator";

/** Texto como o Testing Library normaliza (NBSP vira espaço). */
const formatBRL = (cents: number) =>
  formatBRLNbsp(cents).replaceAll(String.fromCharCode(0xa0), " ");

describe("Calculator", () => {
  it("mostra a economia com os valores iniciais e recalcula ao digitar", async () => {
    const user = userEvent.setup();
    render(
      <Calculator initialOrders={200} initialTicketCents={6000} initialCommissionPercent={23} />,
    );

    // 200 × R$ 60 × 23% = R$ 2.760,00; faixa 151–250 = R$ 169,99
    expect(screen.getByTestId("commission")).toHaveTextContent(formatBRL(276000));
    expect(screen.getByTestId("monthly-fee")).toHaveTextContent(formatBRL(16999));
    expect(screen.getByTestId("savings")).toHaveTextContent(formatBRL(276000 - 16999));
    expect(screen.getByText(/151 a 250 pedidos/u)).toBeInTheDocument();

    const orders = screen.getByLabelText("Pedidos por mês");
    await user.clear(orders);
    await user.type(orders, "100");
    // 100 × 60 × 23% = 1.380,00; faixa até 150 = 84,99
    expect(screen.getByTestId("commission")).toHaveTextContent(formatBRL(138000));
    expect(screen.getByTestId("monthly-fee")).toHaveTextContent(formatBRL(8499));
    expect(screen.getByText(/Até 150 pedidos/u)).toBeInTheDocument();
  });

  it("com volume pequeno não promete economia", async () => {
    const user = userEvent.setup();
    render(
      <Calculator initialOrders={10} initialTicketCents={3000} initialCommissionPercent={10} />,
    );
    expect(screen.getByText(/a diferença por mês/u)).toBeInTheDocument();
    const commission = screen.getByLabelText(/Comissão que você paga hoje/u);
    await user.clear(commission);
    await user.type(commission, "abc");
    expect(screen.getByTestId("commission")).toHaveTextContent(formatBRL(0));
  });
});
