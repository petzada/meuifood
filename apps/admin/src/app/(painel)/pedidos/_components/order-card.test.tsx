// Componente: card da fila (PED-02) e dos Cancelados de hoje (CAN-02, T-12): o selo do Estorno
// aparece nos três estados, separado do status; o card nunca tem ação de cancelar nem de avanço
// quando o Pedido está cancelado.
import type { OrderQueueItem } from "@foode/shared/order";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render } from "../../../../test/render";
import { OrderCard } from "./order-card";

const NOW = Date.parse("2026-11-05T18:00:00.000Z");

function item(partial: Partial<OrderQueueItem> = {}): OrderQueueItem {
  return {
    id: "a",
    code: 12,
    status: "cancelled",
    fulfillment: "delivery",
    createdAt: "2026-11-05T17:56:00.000Z",
    customerName: "Maria Souza",
    neighborhood: "Centro",
    paymentMethod: "pix",
    totalCents: 5490,
    next: [],
    ...partial,
  };
}

function setup(order: OrderQueueItem) {
  const onAdvance = vi.fn();
  const onOpen = vi.fn();
  render(
    <OrderCard
      busy={false}
      isNew={false}
      nowMs={NOW}
      onAdvance={onAdvance}
      onOpen={onOpen}
      order={order}
    />,
  );
  return { onAdvance, onOpen, user: userEvent.setup() };
}

describe("OrderCard", () => {
  it.each([
    ["pending", "Estorno em andamento"],
    ["succeeded", "Estorno concluído"],
    ["failed_retrying", "Estorno falhou — nova tentativa automática"],
  ] as const)("Cancelado com Estorno %s mostra o selo próprio", (state, label) => {
    setup(item({ refund: { state } }));
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("Cancelado sem Estorno (Pagamento na entrega) não mostra selo de Estorno", () => {
    setup(item({ paymentMethod: "on_delivery", refund: null }));
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    expect(screen.queryByText(/Estorno/u)).not.toBeInTheDocument();
  });

  it("nunca tem ação de cancelar nem de avanço; só abre o detalhe", async () => {
    const { onAdvance, onOpen, user } = setup(item({ refund: { state: "pending" } }));
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /cancelar/iu })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Abrir detalhe do Pedido #12/u }));
    expect(onOpen).toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("Pedido ativo: um botão de avanço e nenhum selo de Estorno", () => {
    setup(item({ status: "received", next: ["preparing"] }));
    expect(screen.getByRole("button", { name: "Começar preparo" })).toBeInTheDocument();
    expect(screen.queryByText(/Estorno/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancelar/iu })).not.toBeInTheDocument();
  });
});
