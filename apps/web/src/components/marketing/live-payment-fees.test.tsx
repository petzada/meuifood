import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LivePaymentFees } from "./live-payment-fees";

describe("LivePaymentFees", () => {
  it("mostra as taxas da tabela padrão quando chegam", async () => {
    const load = vi.fn(async () => ({
      fees: [
        { method: "pix", cardMode: null, percentBps: 99, fixedCents: 0 },
        { method: "credit", cardMode: "normal", percentBps: 399, fixedCents: 30 },
        { method: "credit", cardMode: "rapido", percentBps: 599, fixedCents: 0 },
      ],
    }));
    render(<LivePaymentFees load={load} />);
    expect(await screen.findByText("0,99%")).toBeInTheDocument();
    expect(screen.getByText(/3,99% \+ R\$/u)).toBeInTheDocument();
    expect(screen.getByText("5,99%")).toBeInTheDocument();
  });

  it("sem tabela (ou fora do contrato) fica no card combinado no cadastro", async () => {
    const load = vi.fn(async () => ({ fees: [{ method: "boleto" }] }));
    render(<LivePaymentFees load={load} />);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    expect(screen.getByText("Taxa combinada no cadastro da loja")).toBeInTheDocument();
  });
});
