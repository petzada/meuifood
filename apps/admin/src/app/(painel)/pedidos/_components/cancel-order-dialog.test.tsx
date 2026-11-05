// Componente: diálogo de confirmação do Cancelar (Ticket 12; CAN-01, T-12, P-OPE-3). Mostra a
// consequência financeira certa nos três casos, manda o motivo escolhido (ou nenhum), Voltar/Esc
// fecham sem cancelar e o foco fica dentro enquanto aberto.
import type { CancelReason, OrderDetail } from "@foode/shared/order";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render } from "../../../../test/render";
import { CancelOrderDialog, previewFor } from "./cancel-order-dialog";

const ORDER: OrderDetail = {
  id: "a",
  code: 42,
  status: "preparing",
  fulfillment: "delivery",
  createdAt: "2026-11-05T17:56:00.000Z",
  customer: { name: "Maria Souza", phone: "5511987654321" },
  address: null,
  lines: [],
  subtotalCents: 5000,
  deliveryFeeCents: 490,
  discountCents: 0,
  totalCents: 5490,
  serviceFeeCents: 149,
  payment: { method: "pix", changeForCents: null },
  note: null,
  eta: null,
  next: ["out_for_delivery"],
  cancellable: true,
  cancelPreview: {
    kind: "refund",
    amountCents: 5639,
    text: "R$ 56,39 serão estornados automaticamente ao Consumidor.",
  },
  history: [],
  trackingPath: "/loja/pizza/pedido/tok",
};

function setup(order: OrderDetail = ORDER, busy = false) {
  const user = userEvent.setup();
  const onConfirm = vi.fn<(reason: CancelReason | undefined) => Promise<void>>(
    async () => undefined,
  );
  const onClose = vi.fn();
  render(<CancelOrderDialog busy={busy} onClose={onClose} onConfirm={onConfirm} order={order} />);
  return { onClose, onConfirm, user };
}

describe("CancelOrderDialog", () => {
  it("nomeia o Pedido e escreve o Estorno automático quando pago online", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Cancelar o Pedido #42?" });
    expect(dialog).toHaveTextContent("R$ 56,39 serão estornados automaticamente ao Consumidor.");
    const confirm = within(dialog).getByRole("button", { name: "Cancelar o Pedido" });
    expect(confirm).toHaveAccessibleDescription(
      "R$ 56,39 serão estornados automaticamente ao Consumidor.",
    );
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("Pagamento na entrega: só o Pedido muda", () => {
    setup({
      ...ORDER,
      payment: { method: "on_delivery", changeForCents: null },
      cancelPreview: { kind: "on_delivery", text: "O Pedido será cancelado." },
    });
    expect(screen.getByRole("dialog")).toHaveTextContent("O Pedido será cancelado.");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("estornados");
  });

  it("cobrança pendente: a cobrança é cancelada", () => {
    setup({
      ...ORDER,
      cancelPreview: { kind: "charge_cancel", text: "A cobrança será cancelada." },
    });
    expect(screen.getByRole("dialog")).toHaveTextContent("A cobrança será cancelada.");
  });

  it("sem `cancelPreview` a mesma regra do contrato decide pelo pagamento", () => {
    expect(previewFor({ ...ORDER, cancelPreview: null })).toEqual({
      kind: "refund",
      amountCents: 5639,
      text: expect.stringMatching(/^R\$\s56,39 serão estornados automaticamente ao Consumidor\.$/u),
    });
    expect(
      previewFor({
        ...ORDER,
        cancelPreview: null,
        payment: { method: "on_delivery", changeForCents: null },
      }).kind,
    ).toBe("on_delivery");
  });

  it("cancela sem motivo por padrão", async () => {
    const { onConfirm, user } = setup();
    expect(screen.getByRole("radio", { name: "Sem motivo" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Cancelar o Pedido" }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("cancela com o motivo escolhido da lista fixa", async () => {
    const { onConfirm, user } = setup();
    const group = screen.getByRole("group", { name: "Motivo (opcional)" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["", "item_unavailable", "no_courier", "customer_request", "other"]);
    await user.click(screen.getByRole("radio", { name: "Loja sem entregador" }));
    await user.click(screen.getByRole("button", { name: "Cancelar o Pedido" }));
    expect(onConfirm).toHaveBeenCalledWith("no_courier");
  });

  it("Voltar e Esc fecham sem cancelar; ocupado desabilita os botões", async () => {
    const { onClose, onConfirm, user } = setup();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();

    setup(ORDER, true);
    expect(screen.getByRole("button", { name: "Cancelando..." })).toBeDisabled();
  });
});
