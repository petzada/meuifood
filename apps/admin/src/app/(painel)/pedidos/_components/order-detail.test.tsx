// Componente: detalhe do Pedido (PED-07): itens com escolhas, observação, troco, endereço,
// "Avisar no WhatsApp" com texto por status e link de acompanhamento, Imprimir e Cancelar com
// confirmação que nomeia o Pedido e a consequência (T-12).
import type { OrderDetail } from "@foode/shared/order";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrderDetailPanel } from "./order-detail";

const ORDER: OrderDetail = {
  id: "a",
  code: 42,
  status: "preparing",
  fulfillment: "delivery",
  createdAt: "2026-11-05T17:56:00.000Z",
  customer: { name: "Maria Souza", phone: "5511987654321" },
  address: {
    postalCode: null,
    street: "Rua das Flores",
    number: "123",
    complement: "Ap 12",
    reference: "Portão azul",
    neighborhood: "Centro",
  },
  lines: [
    {
      itemName: "X-Burger",
      quantity: 2,
      unitPriceCents: 2500,
      totalCents: 5000,
      complements: [{ groupName: "Ponto", optionName: "Ao ponto", priceCents: 0 }],
      additionals: [{ name: "Bacon", priceCents: 300 }],
    },
  ],
  subtotalCents: 5000,
  deliveryFeeCents: 490,
  discountCents: 0,
  totalCents: 5490,
  payment: { method: "on_delivery", changeForCents: 10000 },
  note: "Sem cebola",
  eta: { minMinutes: 30, maxMinutes: 45 },
  next: ["out_for_delivery"],
  cancellable: true,
  history: [],
  trackingPath: "/loja/pizza/pedido/tok",
};

function setup(order: OrderDetail = ORDER) {
  const user = userEvent.setup();
  const onCancel = vi.fn(async () => undefined);
  const onAdvance = vi.fn(async () => undefined);
  const onPrint = vi.fn();
  const onClose = vi.fn();
  render(
    <OrderDetailPanel
      busy={false}
      loadDetail={async () => order}
      onAdvance={onAdvance}
      onCancel={onCancel}
      onClose={onClose}
      onPrint={onPrint}
      orderId={order.id}
      storeName="Pizza do Zé"
      storefrontOrigin="https://foodedelivery.com.br"
      version={0}
    />,
  );
  return { onAdvance, onCancel, onClose, onPrint, user };
}

describe("OrderDetailPanel", () => {
  it("mostra itens com escolhas, observação, endereço, troco e o WhatsApp por status", async () => {
    setup();
    expect(await screen.findByRole("dialog", { name: "Pedido #42" })).toBeInTheDocument();
    expect(screen.getByText("Ponto: Ao ponto")).toBeInTheDocument();
    expect(screen.getByText("+ Bacon")).toBeInTheDocument();
    expect(screen.getByText("Sem cebola")).toBeInTheDocument();
    expect(screen.getByText(/Rua das Flores, 123 · Ap 12/u)).toBeInTheDocument();
    expect(screen.getByText(/Troco para R\$\s?100,00 \(levar R\$\s?45,10\)/u)).toBeInTheDocument();
    expect(screen.getByText("(11) 98765-4321")).toBeInTheDocument();

    const whatsapp = screen.getByRole("link", { name: "Avisar no WhatsApp" });
    const href = whatsapp.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/5511987654321?text=")).toBe(true);
    const text = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(text).toContain("Olá, Maria! Aqui é da Pizza do Zé.");
    expect(text).toContain("O seu Pedido #42 está sendo preparado.");
    expect(text).toContain("https://foodedelivery.com.br/loja/pizza/pedido/tok");
    expect(whatsapp).toHaveAttribute("target", "_blank");
  });

  it("avançar e imprimir chamam as ações com o Pedido", async () => {
    const { onAdvance, onPrint, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Marcar como Saiu para entrega" }));
    expect(onAdvance).toHaveBeenCalledWith(ORDER, "out_for_delivery");
    await user.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(onPrint).toHaveBeenCalledWith(ORDER);
  });

  it("cancelar pede confirmação que nomeia o Pedido e a consequência", async () => {
    const { onCancel, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Cancelar Pedido" }));
    const dialog = screen.getByRole("dialog", { name: "Cancelar o Pedido #42?" });
    expect(dialog).toHaveTextContent("Nada foi cobrado do Consumidor.");
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(
      screen.queryByRole("dialog", { name: "Cancelar o Pedido #42?" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar Pedido" }));
    await user.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    expect(onCancel).toHaveBeenCalledWith(ORDER);
  });

  it("pago online: a confirmação diz o valor a devolver; Esc fecha o painel", async () => {
    const { onClose, user } = setup({
      ...ORDER,
      payment: { method: "pix", changeForCents: null },
    });
    await user.click(await screen.findByRole("button", { name: "Cancelar Pedido" }));
    expect(screen.getByRole("dialog", { name: "Cancelar o Pedido #42?" })).toHaveTextContent(
      /valor pago online \(R\$\s?54,90\)/u,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
