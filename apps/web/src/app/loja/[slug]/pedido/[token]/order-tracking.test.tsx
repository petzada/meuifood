// Componente: página do Pedido por token (§6). Status na linguagem do Consumidor em
// `aria-live`, passos, itens em snapshot, totais, troco, `wa.me` e atualização periódica
// (que para em estado final). O carregamento periódico entra como função mocada.
import { orderTrackingSchema, type OrderTracking } from "@foode/shared/order";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardRetryApi } from "./card-api";
import { OrderTrackingView } from "./order-tracking";

const order: OrderTracking = orderTrackingSchema.parse({
  address: {
    complement: "ap 12",
    neighborhood: "Centro",
    number: "42",
    postalCode: null,
    reference: "ao lado da padaria",
    street: "Rua A",
  },
  code: 17,
  createdAt: "2026-11-05T22:00:00.000Z",
  customerFirstName: "Maria",
  deliveryFeeCents: 500,
  discountCents: 0,
  eta: { maxMinutes: 60, minMinutes: 40 },
  fulfillment: "delivery",
  lines: [
    {
      additionals: [{ name: "Bacon", priceCents: 300 }],
      complements: [{ groupName: "Pão", optionName: "Brioche", priceCents: 250 }],
      itemName: "X-Burger",
      quantity: 2,
      totalCents: 6100,
      unitPriceCents: 3050,
    },
  ],
  note: "apertar a campainha",
  payment: { changeForCents: 10000, method: "on_delivery" },
  status: "received",
  store: { name: "Lanchonete do Zé", slug: "lanchonete-do-ze", whatsapp: "5511987654321" },
  subtotalCents: 6100,
  totalCents: 6600,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OrderTrackingView", () => {
  it("mostra status, itens com escolhas, totais, troco, endereço e WhatsApp da Loja", () => {
    render(<OrderTrackingView initial={order} storeSlug="lanchonete-do-ze" token="t" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pedido #17");
    const status = screen.getByRole("heading", { name: "Pedido recebido pela Loja" });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Recebido").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/Previsão: 40–60 min para entregar/u)).toBeInTheDocument();
    expect(screen.getByText("X-Burger", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Pão: Brioche +R$ 2,50")).toBeInTheDocument();
    expect(screen.getByText("Bacon +R$ 3,00")).toBeInTheDocument();
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 66,00");
    expect(screen.getByText(/troco para R\$ 100,00/u)).toBeInTheDocument();
    expect(screen.getByText("Rua A, 42")).toBeInTheDocument();
    expect(screen.getByText(/apertar a campainha/u)).toBeInTheDocument();
    const whatsapp = screen.getByRole("link", { name: "Falar com a Loja" });
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/u);
    expect(screen.getByRole("link", { name: "Voltar ao Cardápio" })).toHaveAttribute(
      "href",
      "/loja/lanchonete-do-ze",
    );
  });

  it("atualiza o status periodicamente e para no estado final", async () => {
    const load = vi
      .fn<() => Promise<OrderTracking | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...order, status: "out_for_delivery" })
      .mockResolvedValueOnce({ ...order, status: "completed" });
    render(
      <OrderTrackingView
        initial={order}
        load={load}
        pollIntervalMs={1000}
        storeSlug="s"
        token="t"
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole("heading", { name: "Pedido recebido pela Loja" })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole("heading", { name: "Saiu para entrega" })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole("heading", { name: "Pedido entregue" })).toBeInTheDocument();
    expect(screen.queryByText(/Previsão/u)).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("Retirada sem WhatsApp: passos próprios, 'grátis' e cancelado vira selo", () => {
    render(
      <OrderTrackingView
        initial={{
          ...order,
          address: null,
          deliveryFeeCents: 0,
          fulfillment: "pickup",
          payment: { changeForCents: null, method: "on_delivery" },
          status: "cancelled",
          store: { ...order.store, whatsapp: null },
        }}
        storeSlug="s"
        token="t"
      />,
    );
    expect(screen.getByRole("heading", { name: "Pedido cancelado" })).toBeInTheDocument();
    expect(screen.getByText("Retirada").nextElementSibling).toHaveTextContent("grátis");
    expect(screen.queryByRole("link", { name: "Falar com a Loja" })).not.toBeInTheDocument();
    expect(screen.queryByText(/troco/u)).not.toBeInTheDocument();
  });

  describe("PIX (Ticket 26)", () => {
    const pixOrder: OrderTracking = {
      ...order,
      payment: { changeForCents: null, method: "pix" },
      serviceFeeCents: 150,
      pix: {
        state: "pending",
        amountCents: 6750,
        copyPaste: "000201-codigo",
        qrCodeDataUrl: "data:image/png;base64,iVBORw0KGgo=",
        expiresAt: "2026-11-05T22:30:00.000Z",
      },
    };

    it("aguardando: bloco do PIX no lugar dos passos, tarifa em linha própria e total pago", () => {
      render(
        <OrderTrackingView
          initial={pixOrder}
          pixNow={() => Date.parse("2026-11-05T22:00:00.000Z")}
          storeSlug="s"
          token="t"
        />,
      );
      expect(screen.getByRole("heading", { name: "Aguardando pagamento" })).toBeInTheDocument();
      expect(screen.queryByText("Recebido")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Pedido recebido pela Loja" })).toBeNull();
      expect(
        screen.getByText("Tarifa de serviço (pagamento online)").nextElementSibling,
      ).toHaveTextContent("R$ 1,50");
      expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 67,50");
    });

    it("atualiza no intervalo do PIX e troca sozinha para 'Pagamento confirmado'", async () => {
      const load = vi.fn<() => Promise<OrderTracking | null>>().mockResolvedValue({
        ...pixOrder,
        pix: { ...pixOrder.pix!, state: "paid", copyPaste: null, qrCodeDataUrl: null },
      });
      render(
        <OrderTrackingView
          initial={pixOrder}
          load={load}
          pixNow={() => Date.parse("2026-11-05T22:00:00.000Z")}
          pixPollIntervalMs={500}
          pollIntervalMs={60_000}
          storeSlug="s"
          token="t"
        />,
      );
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(load).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("heading", { name: "Pedido recebido pela Loja" })).toBeVisible();
      expect(screen.getByText("Pagamento confirmado.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copiar código" })).toBeNull();
    });
  });

  describe("Cartão (Ticket 27)", () => {
    const cardOrder: OrderTracking = {
      ...order,
      payment: { changeForCents: null, method: "credit" },
      serviceFeeCents: 150,
      card: {
        amountCents: 6750,
        brand: "visa",
        declineReason: null,
        lastFour: "4242",
        retryActions: [],
        state: "processing",
        tokenizer: null,
      },
    };

    it("processando: bloco do Cartão no lugar dos passos; aprovado volta aos passos", async () => {
      const load = vi.fn<() => Promise<OrderTracking | null>>().mockResolvedValue({
        ...cardOrder,
        card: { ...cardOrder.card!, state: "approved" },
      });
      render(
        <OrderTrackingView
          initial={cardOrder}
          load={load}
          pixPollIntervalMs={500}
          pollIntervalMs={60_000}
          storeSlug="s"
          token="t"
        />,
      );
      expect(screen.getByRole("heading", { name: "Processando o pagamento" })).toHaveAttribute(
        "aria-live",
        "polite",
      );
      expect(screen.queryByText("Recebido")).not.toBeInTheDocument();
      expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 67,50");
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(load).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("heading", { name: "Pedido recebido pela Loja" })).toBeVisible();
      expect(screen.getByText("Pagamento confirmado.")).toBeInTheDocument();
    });

    it("recusado: mostra as ações do contrato", () => {
      render(
        <OrderTrackingView
          initial={{
            ...cardOrder,
            card: {
              ...cardOrder.card!,
              declineReason: "issuer_declined",
              retryActions: ["pix"],
              state: "declined",
            },
          }}
          storeSlug="s"
          token="t"
        />,
      );
      expect(screen.getByRole("heading", { name: "Pagamento recusado" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pagar com PIX" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Tentar outro cartão" })).toBeNull();
    });

    it("'Pagar com PIX' troca o Pedido na mesma página: o bloco do PIX entra no lugar do Cartão", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const declinedOrder: OrderTracking = {
        ...cardOrder,
        card: {
          ...cardOrder.card!,
          declineReason: "issuer_declined",
          retryActions: ["pix"],
          state: "declined",
        },
      };
      const switched: OrderTracking = {
        ...declinedOrder,
        card: null,
        payment: { changeForCents: null, method: "pix" },
        pix: {
          state: "pending",
          amountCents: 6750,
          copyPaste: "000201-codigo-troca",
          qrCodeDataUrl: null,
          expiresAt: "2026-11-05T22:30:00.000Z",
        },
      };
      const load = vi.fn<() => Promise<OrderTracking | null>>().mockResolvedValue(switched);
      const cardApi: CardRetryApi = {
        payWithPix: vi.fn(async () => ({ kind: "ok" as const })),
        retry: vi.fn(async () => ({ kind: "ok" as const })),
      };
      render(
        <OrderTrackingView
          cardApi={cardApi}
          initial={declinedOrder}
          load={load}
          pixNow={() => Date.parse("2026-11-05T22:00:00.000Z")}
          pollIntervalMs={60_000}
          storeSlug="s"
          token="t"
        />,
      );
      await user.click(screen.getByRole("button", { name: "Pagar com PIX" }));
      expect(await screen.findByRole("heading", { name: "Aguardando pagamento" })).toBeVisible();
      expect(cardApi.payWithPix).toHaveBeenCalledWith("s", "t");
      expect(load).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("heading", { name: "Pagamento recusado" })).toBeNull();
      expect(screen.getByRole("button", { name: "Copiar código" })).toBeInTheDocument();
      // Mesmo Pedido, mesmo total e tarifa: nada foi refeito.
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pedido #17");
      expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("R$ 67,50");
    });
  });
});
