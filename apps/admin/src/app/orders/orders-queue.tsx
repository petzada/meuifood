"use client";

import {
  ORDER_POLL_INTERVAL_MS,
  allowedPickupTransitions,
  canTransitionPickup,
  createEmptyPollSoundState,
  orderStatusLabelPt,
  orderStatusSchema,
  stepOrderPollSound,
  type OrderStatus,
  type PollSoundState,
} from "@foode/shared";
import { OutlineContainer } from "@foode/ui";
import { useEffect, useRef, useState } from "react";

type OrderListItem = {
  guestName: string;
  id: string;
  publicCode: string;
  status: OrderStatus;
  totalCents: number;
};

type OrderLineDetail = {
  additionalSnapshots: Array<{ name: string; priceCents: number }>;
  complementSnapshots: Array<{ groupName: string; optionName: string }>;
  itemName: string;
  lineTotalCents: number;
  quantity: number;
};

type OrderDetail = OrderListItem & {
  guestPhoneE164?: string;
  lines: OrderLineDetail[];
};

function formatPrice(priceCents: number) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

function playNewOrderBeep() {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    window.setTimeout(() => {
      oscillator.stop();
      void context.close();
    }, 200);
  } catch {
    // Som é opcional; falha silenciosa.
  }
}

export function OrdersQueue({
  accessToken,
  apiUrl,
}: {
  accessToken: string;
  apiUrl: string;
}) {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const pollSoundRef = useRef<PollSoundState>(createEmptyPollSoundState());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(new URL("/orders", apiUrl), {
          cache: "no-store",
          headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          if (!cancelled) {
            setError("Não foi possível carregar os Pedidos.");
            setLoading(false);
          }
          return;
        }
        const payload = (await response.json()) as { orders?: OrderListItem[] };
        if (!Array.isArray(payload.orders)) {
          if (!cancelled) {
            setError("Resposta inválida da fila de Pedidos.");
            setLoading(false);
          }
          return;
        }
        const nextOrders = payload.orders.flatMap((order) => {
          const status = orderStatusSchema.safeParse(order.status);
          if (!status.success) return [];
          return [{ ...order, status: status.data }];
        });
        const soundStep = stepOrderPollSound(
          pollSoundRef.current,
          nextOrders.map((order) => order.id),
        );
        pollSoundRef.current = {
          baselineEstablished: soundStep.baselineEstablished,
          seenOrderIds: soundStep.nextSeenOrderIds,
        };
        if (soundStep.playForOrderIds.length > 0) {
          playNewOrderBeep();
        }
        if (!cancelled) {
          setOrders(nextOrders);
          setError(null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar os Pedidos.");
          setLoading(false);
        }
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, ORDER_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, apiUrl]);

  async function loadDetail(orderId: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await fetch(
        new URL(`/orders/${encodeURIComponent(orderId)}`, apiUrl),
        {
          cache: "no-store",
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        setDetail(null);
        setDetailError("Não foi possível abrir este Pedido.");
        return;
      }
      const payload = (await response.json()) as { order?: OrderDetail };
      const status = orderStatusSchema.safeParse(payload.order?.status);
      if (!payload.order || !status.success || !Array.isArray(payload.order.lines)) {
        setDetail(null);
        setDetailError("Detalhe do Pedido inválido.");
        return;
      }
      setDetail({ ...payload.order, status: status.data });
    } catch {
      setDetail(null);
      setDetailError("Não foi possível abrir este Pedido.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleExpand(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      setDetail(null);
      setDetailError(null);
      return;
    }
    setExpandedId(orderId);
    await loadDetail(orderId);
  }

  async function transitionTo(to: OrderStatus) {
    if (!detail) return;
    if (!canTransitionPickup(detail.status, to)) {
      setDetailError("Transição não permitida para este Pedido.");
      return;
    }
    setTransitioning(true);
    setDetailError(null);
    try {
      const response = await fetch(
        new URL(
          `/orders/${encodeURIComponent(detail.id)}/transitions`,
          apiUrl,
        ),
        {
          body: JSON.stringify({ to }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      if (!response.ok) {
        setDetailError("Transição não permitida para este Pedido.");
        return;
      }
      const payload = (await response.json()) as { order?: OrderDetail };
      const status = orderStatusSchema.safeParse(payload.order?.status);
      if (!payload.order || !status.success) {
        setDetailError("Resposta inválida ao atualizar o Pedido.");
        return;
      }
      const next = { ...payload.order, status: status.data };
      setDetail(next);
      setOrders((current) =>
        current.map((order) =>
          order.id === next.id
            ? {
                guestName: next.guestName,
                id: next.id,
                publicCode: next.publicCode,
                status: next.status,
                totalCents: next.totalCents,
              }
            : order,
        ),
      );
    } catch {
      setDetailError("Não foi possível atualizar o status.");
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <OutlineContainer className="mt-8 p-6 md:p-8">
      <h2 className="text-xl font-bold text-[var(--color-ink)]">Pedidos</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Fila atualizada a cada 10 segundos.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">Carregando Pedidos…</p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm font-bold text-[var(--color-error)]" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && orders.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Nenhum Pedido em andamento.
        </p>
      ) : null}

      {orders.length > 0 ? (
        <ul className="mt-5 grid gap-3">
          {orders.map((order) => {
            const expanded = expandedId === order.id;
            const transitions = allowedPickupTransitions(order.status);
            return (
              <li key={order.id}>
                <button
                  className="flex min-h-12 w-full items-start justify-between gap-3 rounded-xl border border-[var(--color-hairline)] px-4 py-3 text-left active:translate-y-px"
                  onClick={() => {
                    void toggleExpand(order.id);
                  }}
                  type="button"
                >
                  <span>
                    <span className="block font-bold text-[var(--color-ink)]">
                      #{order.publicCode} · {order.guestName}
                    </span>
                    <span className="mt-1 block text-sm text-[var(--color-muted)]">
                      {orderStatusLabelPt(order.status)}
                    </span>
                  </span>
                  <strong className="shrink-0 text-[var(--color-primary-active)]">
                    {formatPrice(order.totalCents)}
                  </strong>
                </button>

                {expanded ? (
                  <div className="mt-2 rounded-xl border border-[var(--color-hairline-soft)] px-4 py-4">
                    {detailLoading ? (
                      <p className="text-sm text-[var(--color-muted)]">
                        Carregando detalhe…
                      </p>
                    ) : null}
                    {detailError ? (
                      <p
                        className="text-sm font-bold text-[var(--color-error)]"
                        role="alert"
                      >
                        {detailError}
                      </p>
                    ) : null}
                    {detail && detail.id === order.id ? (
                      <div className="grid gap-4">
                        <div className="grid gap-3">
                          {detail.lines.map((line, index) => (
                            <div
                              className="border-t border-[var(--color-hairline-soft)] pt-3 first:border-t-0 first:pt-0"
                              key={`${line.itemName}-${index}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-bold text-[var(--color-ink)]">
                                    {line.quantity}× {line.itemName}
                                  </p>
                                  {line.complementSnapshots.map((complement) => (
                                    <p
                                      className="mt-1 text-sm text-[var(--color-muted)]"
                                      key={`${complement.groupName}-${complement.optionName}`}
                                    >
                                      {complement.groupName}: {complement.optionName}
                                    </p>
                                  ))}
                                  {line.additionalSnapshots.map((additional) => (
                                    <p
                                      className="mt-1 text-sm text-[var(--color-muted)]"
                                      key={additional.name}
                                    >
                                      {additional.name}
                                    </p>
                                  ))}
                                </div>
                                <strong className="shrink-0 text-[var(--color-ink)]">
                                  {formatPrice(line.lineTotalCents)}
                                </strong>
                              </div>
                            </div>
                          ))}
                        </div>

                        {transitions.length > 0 ? (
                          <div className="flex flex-wrap gap-2 border-t border-[var(--color-hairline)] pt-4">
                            {transitions.map((to) => (
                              <button
                                className="min-h-11 rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-body)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={transitioning}
                                key={to}
                                onClick={() => {
                                  void transitionTo(to);
                                }}
                                type="button"
                              >
                                {orderStatusLabelPt(to)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[var(--color-muted)]">
                            Sem transições disponíveis.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </OutlineContainer>
  );
}
