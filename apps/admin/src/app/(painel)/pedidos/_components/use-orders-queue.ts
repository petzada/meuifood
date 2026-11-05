"use client";

// Polling da fila (decisão 23, PED-04 a PED-06): a cada 10 s busca a lista inteira, guarda o
// relógio do servidor para "há N min" e "Atualizado há N s", marca "Sem conexão" sem limpar a
// lista e toca o som uma vez por Pedido realmente novo (`stepOrderPollSound`: a 1ª carga só
// estabelece a baseline). Nada de rede direta aqui: `loadList` vem por prop (testável).
import { createEmptyPollSoundState, stepOrderPollSound, type PollSoundState } from "@foode/shared";
import {
  ORDER_QUEUE_POLL_INTERVAL_MS,
  type OrderQueueItem,
  type OrdersList,
  type OrderStatus,
} from "@foode/shared/order";
import { useCallback, useEffect, useRef, useState } from "react";

import { createQueueSound, type QueueSound } from "./sound";

export type LoadList = () => Promise<OrdersList>;

export type QueueState = {
  orders: OrderQueueItem[];
  closedToday: OrdersList["closedToday"];
  /** Relógio do servidor − relógio local, em ms; 0 até a 1ª resposta. */
  serverOffsetMs: number;
  /** Instante local da última resposta boa; null antes da 1ª. */
  updatedAtMs: number | null;
  loading: boolean;
  offline: boolean;
};

export type OrdersQueue = QueueState & {
  /** Agora, no relógio do servidor (ms); avança a cada segundo. */
  nowMs: number;
  refresh(): Promise<void>;
  /** Atualiza um Pedido na hora, depois de avançar/cancelar (sem esperar o próximo polling). */
  patchOrder(
    orderId: string,
    status: OrderStatus,
    next: OrderStatus[],
    refund?: OrderQueueItem["refund"],
  ): void;
  sound: { ready: boolean; muted: boolean; unlock(): Promise<void>; toggleMute(): void };
  /** Pedidos novos (ids) desde o último polling, para o `aria-live`. */
  arrived: string[];
};

export function useOrdersQueue({
  intervalMs = ORDER_QUEUE_POLL_INTERVAL_MS,
  loadList,
  sound: soundFactory = createQueueSound,
}: {
  intervalMs?: number;
  loadList: LoadList;
  sound?: () => QueueSound;
}): OrdersQueue {
  const [state, setState] = useState<QueueState>({
    orders: [],
    closedToday: { completed: 0, cancelled: 0 },
    serverOffsetMs: 0,
    updatedAtMs: null,
    loading: true,
    offline: false,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [arrived, setArrived] = useState<string[]>([]);
  const [soundReady, setSoundReady] = useState(false);
  const [muted, setMuted] = useState(false);

  const soundRef = useRef<QueueSound | null>(null);
  const pollSound = useRef<PollSoundState>(createEmptyPollSoundState());
  const mutedRef = useRef(false);
  const inFlight = useRef(false);

  soundRef.current ??= soundFactory();

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const list = await loadList();
      const step = stepOrderPollSound(
        pollSound.current,
        list.orders.map((order) => order.id),
      );
      pollSound.current = {
        baselineEstablished: step.baselineEstablished,
        seenOrderIds: step.nextSeenOrderIds,
      };
      const receivedAt = Date.now();
      setState({
        orders: list.orders,
        closedToday: list.closedToday,
        serverOffsetMs: Date.parse(list.serverTime) - receivedAt,
        updatedAtMs: receivedAt,
        loading: false,
        offline: false,
      });
      if (step.playForOrderIds.length > 0) {
        setArrived(step.playForOrderIds);
        if (!mutedRef.current) soundRef.current?.play();
      }
    } catch {
      setState((previous) => ({ ...previous, loading: false, offline: true }));
    } finally {
      inFlight.current = false;
    }
  }, [loadList]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, refresh]);

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const patchOrder = useCallback(
    (
      orderId: string,
      status: OrderStatus,
      next: OrderStatus[],
      refund?: OrderQueueItem["refund"],
    ) => {
      setState((previous) => ({
        ...previous,
        orders: previous.orders.map((order) =>
          order.id === orderId
            ? { ...order, status, next, ...(refund !== undefined ? { refund } : {}) }
            : order,
        ),
      }));
    },
    [],
  );

  const unlock = useCallback(async () => {
    const ready = (await soundRef.current?.unlock()) ?? false;
    setSoundReady(ready);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      mutedRef.current = !value;
      return !value;
    });
  }, []);

  return {
    ...state,
    nowMs: nowMs + state.serverOffsetMs,
    refresh,
    patchOrder,
    sound: { ready: soundReady, muted, unlock, toggleMute },
    arrived,
  };
}
