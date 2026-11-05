// Componente: fila de Pedidos (Ticket 24b). Polling de 10 s com som uma vez por Pedido novo,
// faixa para liberar o áudio, chips, "Sem conexão" mantendo a lista, título da aba, transição
// com destino explícito e "Imprimir ao aceitar". Sem rede: carregadores e actions são vi.fn().
import type { OrderDetail, OrderQueueItem, OrdersList } from "@foode/shared/order";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderActionResult } from "../actions";
import { QueueBoard, type QueueBoardProps } from "./queue-board";
import type { QueueSound } from "./sound";

const SERVER_NOW = "2026-11-05T18:00:00.000Z";

function item(partial: Partial<OrderQueueItem> & { id: string; code: number }): OrderQueueItem {
  return {
    status: "received",
    fulfillment: "delivery",
    createdAt: "2026-11-05T17:56:00.000Z",
    customerName: "Maria Souza",
    neighborhood: "Centro",
    paymentMethod: "pix",
    totalCents: 5490,
    next: ["preparing"],
    ...partial,
  };
}

function list(orders: OrderQueueItem[]): OrdersList {
  return { orders, closedToday: { completed: 3, cancelled: 1 }, serverTime: SERVER_NOW };
}

function detail(order: OrderQueueItem): OrderDetail {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    fulfillment: order.fulfillment,
    createdAt: order.createdAt,
    customer: { name: order.customerName, phone: "5511987654321" },
    address:
      order.fulfillment === "delivery"
        ? {
            postalCode: null,
            street: "Rua das Flores",
            number: "123",
            complement: null,
            reference: null,
            neighborhood: "Centro",
          }
        : null,
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
    payment: { method: order.paymentMethod, changeForCents: null },
    note: null,
    eta: { minMinutes: 30, maxMinutes: 45 },
    next: order.next,
    cancellable: true,
    history: [],
    trackingPath: "/loja/pizza/pedido/tok",
  };
}

function fakeSound() {
  const state = { ready: false };
  const sound: QueueSound & { play: ReturnType<typeof vi.fn<() => void>> } = {
    get ready() {
      return state.ready;
    },
    unlock: vi.fn(async () => {
      state.ready = true;
      return true;
    }),
    play: vi.fn<() => void>(),
  };
  return sound;
}

function setup(overrides: Partial<QueueBoardProps> = {}) {
  const sound = fakeSound();
  const loadList = vi.fn<() => Promise<OrdersList>>();
  const loadDetail = vi.fn(async (orderId: string) => detail(item({ id: orderId, code: 0 })));
  const transition = vi.fn<QueueBoardProps["transition"]>();
  const cancel = vi.fn<QueueBoardProps["cancel"]>();
  const storage = {
    getItem: vi.fn(() => "done"),
    setItem: vi.fn(),
  } as unknown as Storage;
  // Relógio falso: sem `delay` o user-event não espera timers que nunca avançam.
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, delay: null });
  const props: QueueBoardProps = {
    cancel,
    intervalMs: 10_000,
    loadDetail,
    loadList,
    role: "owner",
    sound: () => sound,
    storage,
    storefrontOrigin: "https://foodedelivery.com.br",
    storeName: "Pizza do Zé",
    storeSlug: "pizza",
    transition,
    userId: "u1",
    ...overrides,
  };
  return { cancel, loadDetail, loadList, props, sound, storage, transition, user };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function poll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
}

beforeEach(() => {
  // Só o polling (setInterval) e o relógio são falsos: o Testing Library espera um
  // `setTimeout(0)` real depois de cada interação.
  vi.useFakeTimers({
    now: Date.parse(SERVER_NOW),
    toFake: ["setInterval", "clearInterval", "Date"],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("QueueBoard (fila de Pedidos)", () => {
  it("mostra as colunas, o selo Novo, o destino do botão e conta na aba", async () => {
    const { loadList, props } = setup();
    loadList.mockResolvedValue(
      list([
        item({ id: "a", code: 12 }),
        item({ id: "b", code: 13, status: "preparing", next: ["out_for_delivery"] }),
        item({
          id: "c",
          code: 14,
          fulfillment: "pickup",
          neighborhood: null,
          paymentMethod: "on_delivery",
          status: "ready_for_pickup",
          next: ["completed"],
        }),
      ]),
    );
    render(<QueueBoard {...props} />);
    await flush();

    const received = screen.getByRole("region", { name: "Recebidos (1)" });
    expect(within(received).getByText("#12")).toBeInTheDocument();
    expect(within(received).getByText("Novo")).toBeInTheDocument();
    expect(within(received).getByText("há 4 min")).toBeInTheDocument();
    expect(within(received).getByText("Pago online")).toBeInTheDocument();
    expect(within(received).getByRole("button", { name: "Começar preparo" })).toBeInTheDocument();

    const preparing = screen.getByRole("region", { name: "Em preparo (1)" });
    expect(
      within(preparing).getByRole("button", { name: "Marcar como Saiu para entrega" }),
    ).toBeInTheDocument();

    const ready = screen.getByRole("region", { name: "Prontos / Saiu para entrega (1)" });
    expect(within(ready).getByText("Pagar na entrega")).toBeInTheDocument();
    expect(within(ready).getByRole("button", { name: "Concluir" })).toBeInTheDocument();

    expect(document.title).toBe("(1) Pedidos · Foode");
    expect(screen.getByText(/Concluídos hoje \(3\)/u)).toBeInTheDocument();
    expect(screen.getByText("Atualizado há 0 s")).toBeInTheDocument();
  });

  it("chips Todos/Delivery/Retirada filtram sem nova busca", async () => {
    const { loadList, props, user } = setup();
    loadList.mockResolvedValue(
      list([
        item({ id: "a", code: 12 }),
        item({ id: "b", code: 13, fulfillment: "pickup", neighborhood: null }),
      ]),
    );
    render(<QueueBoard {...props} />);
    await flush();
    expect(screen.getByRole("region", { name: "Recebidos (2)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retirada" }));
    const received = screen.getByRole("region", { name: "Recebidos (1)" });
    expect(within(received).getByText("#13")).toBeInTheDocument();
    expect(within(received).queryByText("#12")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirada" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(loadList).toHaveBeenCalledTimes(1);
  });

  it("polling de 10 s: toca uma vez por Pedido novo depois de liberar o som", async () => {
    const { loadList, props, sound, user } = setup();
    loadList.mockResolvedValueOnce(list([item({ id: "a", code: 12 })]));
    render(<QueueBoard {...props} />);
    await flush();
    expect(sound.play).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /Clique para ativar o som de novos Pedidos/u }),
    );
    expect(sound.unlock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Som ligado" })).toBeInTheDocument();

    loadList.mockResolvedValueOnce(
      list([item({ id: "a", code: 12 }), item({ id: "b", code: 13 })]),
    );
    await poll();
    expect(loadList).toHaveBeenCalledTimes(2);
    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 Pedido novo na fila.")).toBeInTheDocument();
    expect(document.title).toBe("(2) Pedidos · Foode");

    // Mesma lista: nada toca de novo.
    loadList.mockResolvedValueOnce(
      list([item({ id: "a", code: 12 }), item({ id: "b", code: 13 })]),
    );
    await poll();
    expect(sound.play).toHaveBeenCalledTimes(1);
  });

  it("falha do polling vira 'Sem conexão' e mantém a lista", async () => {
    const { loadList, props } = setup();
    loadList.mockResolvedValueOnce(list([item({ id: "a", code: 12 })]));
    render(<QueueBoard {...props} />);
    await flush();

    loadList.mockRejectedValueOnce(new Error("fila: 503"));
    await poll();
    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão — tentando de novo");
    expect(screen.getByText("#12")).toBeInTheDocument();

    loadList.mockResolvedValueOnce(list([item({ id: "a", code: 12 })]));
    await poll();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Atualizado há 0 s")).toBeInTheDocument();
  });

  it("avança o Pedido pela transição do contrato e avisa com o destino", async () => {
    const { loadList, props, transition, user } = setup();
    loadList.mockResolvedValue(list([item({ id: "a", code: 12 })]));
    transition.mockResolvedValue({
      ok: true,
      data: { status: "preparing", next: ["out_for_delivery"], print: false },
    } satisfies OrderActionResult);
    render(<QueueBoard {...props} />);
    await flush();

    await user.click(screen.getByRole("button", { name: "Começar preparo" }));
    expect(transition).toHaveBeenCalledWith({ orderId: "a", from: "received", to: "preparing" });
    const preparing = screen.getByRole("region", { name: "Em preparo (1)" });
    expect(
      within(preparing).getByRole("button", { name: "Marcar como Saiu para entrega" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Pedido #12 em preparo.");
    await flush();
    expect(document.title).toBe("Pedidos · Foode");
  });

  it("'Imprimir ao aceitar' ligado: aceitar abre a impressão 80 mm", async () => {
    const { loadDetail, loadList, props, transition, user } = setup();
    loadList.mockResolvedValue(list([item({ id: "a", code: 12 })]));
    transition.mockResolvedValue({
      ok: true,
      data: { status: "preparing", next: ["out_for_delivery"], print: true },
    });
    const print = vi.fn();
    vi.stubGlobal("print", print);
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      callback();
      return 1;
    });
    render(<QueueBoard {...props} />);
    await flush();

    await user.click(screen.getByRole("button", { name: "Começar preparo" }));
    await flush();
    expect(loadDetail).toHaveBeenCalledWith("a");
    expect(print).toHaveBeenCalledTimes(1);
    const receipt = document.getElementById("cupom-80mm");
    expect(receipt).not.toBeNull();
    expect(receipt).toHaveTextContent("DELIVERY");
    expect(receipt).toHaveTextContent("Pedido feito pela Foode Delivery");
    expect(document.body.classList.contains("foode-printing")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("conflito na transição recarrega a fila e mostra o erro", async () => {
    const { loadList, props, transition, user } = setup();
    loadList.mockResolvedValue(list([item({ id: "a", code: 12 })]));
    transition.mockResolvedValue({
      ok: false,
      error: "conflict",
      message: "Este Pedido mudou em outra tela. A fila foi atualizada.",
    });
    render(<QueueBoard {...props} />);
    await flush();
    await user.click(screen.getByRole("button", { name: "Começar preparo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Este Pedido mudou em outra tela.");
    expect(loadList).toHaveBeenCalledTimes(2);
  });

  it("fila vazia por papel e tour na primeira visita", async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() } as unknown as Storage;
    const { loadList, props, user } = setup({ role: "operator", storage });
    loadList.mockResolvedValue(list([]));
    render(<QueueBoard {...props} />);
    await flush();

    const tour = screen.getByRole("dialog", { name: "Os Pedidos novos chegam aqui" });
    expect(within(tour).getByText("Pedido de exemplo")).toBeInTheDocument();
    await user.click(within(tour).getByRole("button", { name: "Próximo" }));
    expect(screen.getByRole("dialog", { name: "Um botão, um destino" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pular tour" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(storage.setItem).toHaveBeenCalledWith(
      "foode.painel.tour-fila.v1:u1",
      expect.any(String),
    );
    expect(screen.getByText("Novos Pedidos aparecem aqui com aviso sonoro.")).toBeInTheDocument();
  });
});
