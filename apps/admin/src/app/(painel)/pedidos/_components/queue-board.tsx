"use client";

// Fila de Pedidos (Ticket 24b, PED-01 a PED-08, NAV-07): colunas outline por estado no
// desktop/tablet e abas no celular; chips Todos/Delivery/Retirada; polling de 10 s com som
// (faixa para liberar o áudio), "Atualizado há N s" e "Sem conexão" sem limpar a lista;
// contador na aba do navegador; detalhe lateral; impressão 80 mm (inclusive ao aceitar, P-IMP-1);
// tour de 3 passos na primeira visita. Server actions e carregadores entram por prop.
// Ticket 12: cancelar (só pelo detalhe) manda o motivo opcional e mostra a consequência no toast;
// "Concluídos e Cancelados de hoje" abre os cards fechados, com o selo do Estorno (CAN-02).
import { Button, useToast } from "@foode/ui";
import {
  type CancelReason,
  isAcceptTransition,
  type OrderDetail,
  type OrderQueueItem,
  type OrderStatus,
  QUEUE_FILTERS,
  type QueueFilter,
} from "@foode/shared/order";
import { useCallback, useEffect, useId, useState } from "react";

import {
  type ActiveQueueColumn,
  cancelToast,
  countNewUnopened,
  formatUpdatedAgo,
  groupByColumn,
  QUEUE_COLUMN_LABEL,
  QUEUE_COLUMNS,
  QUEUE_FILTER_LABEL,
  tabTitle,
  transitionToast,
} from "../../../../lib/orders-labels";
import type { CancelActionResult, OrderActionResult } from "../actions";
import { OrderCard } from "./order-card";
import { type LoadDetail, OrderDetailPanel } from "./order-detail";
import { PrintReceipt } from "./print-receipt";
import { QueueTour, useQueueTour } from "./queue-tour";
import type { QueueSound } from "./sound";
import { type LoadList, useOrdersQueue } from "./use-orders-queue";

export type QueueBoardProps = {
  cancel: (input: {
    orderId: string;
    from: OrderStatus;
    reason?: CancelReason;
  }) => Promise<CancelActionResult>;
  intervalMs?: number;
  /** Concluídos e Cancelados do dia (`scope=closed_today`); ausente = sem a seção. */
  loadClosed?: LoadList;
  loadDetail: LoadDetail;
  loadList: LoadList;
  role: "owner" | "operator";
  sound?: () => QueueSound;
  storage?: Storage | null;
  storefrontOrigin: string;
  storeName: string;
  storeSlug: string;
  /** Tour da 1ª visita liberado (falso enquanto as perguntas de perfil estão abertas). */
  tourEnabled?: boolean;
  transition: (input: {
    orderId: string;
    from: OrderStatus;
    to: OrderStatus;
  }) => Promise<OrderActionResult>;
  userId: string;
};

const CLOSED_LABEL = { completed: "Concluídos", cancelled: "Cancelados" } as const;

export function QueueBoard(props: QueueBoardProps) {
  const {
    cancel,
    intervalMs,
    loadClosed,
    loadDetail,
    loadList,
    role,
    sound,
    storage = typeof window === "undefined" ? null : window.localStorage,
    storefrontOrigin,
    storeName,
    storeSlug,
    tourEnabled = true,
    transition,
    userId,
  } = props;

  const queue = useOrdersQueue({
    loadList,
    ...(intervalMs !== undefined ? { intervalMs } : {}),
    ...(sound ? { sound } : {}),
  });
  const tour = useQueueTour(userId, storage);

  const [filter, setFilter] = useState<QueueFilter>("all");
  const [column, setColumn] = useState<ActiveQueueColumn>("received");
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<OrderDetail | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  const [closed, setClosed] = useState<OrderQueueItem[] | null>(null);
  const [closedFailed, setClosedFailed] = useState(false);
  const filterLabelId = useId();
  const closedId = useId();

  const groups = groupByColumn(queue.orders, filter);
  const newCount = countNewUnopened(queue.orders, opened);
  const total = queue.orders.length;

  useEffect(() => {
    document.title = tabTitle(newCount);
  }, [newCount]);

  // Feedback das ações da fila no Toast padrão (decisão 72): preto, topo-centro, 4 s.
  const toast = useToast();
  const pushToast = useCallback(
    (tone: "success" | "error", text: string) => {
      if (tone === "error") toast.error(text);
      else toast.success(text);
    },
    [toast],
  );

  const open = useCallback((order: { id: string }) => {
    setOpened((set) => (set.has(order.id) ? set : new Set([...set, order.id])));
    setSelectedId(order.id);
  }, []);

  const close = useCallback(() => setSelectedId(null), []);
  const donePrinting = useCallback(() => setPrinting(null), []);

  const refreshClosed = useCallback(async () => {
    if (!loadClosed) return;
    try {
      const list = await loadClosed();
      setClosed(list.orders);
      setClosedFailed(false);
    } catch {
      setClosedFailed(true);
    }
  }, [loadClosed]);

  useEffect(() => {
    if (closedOpen) void refreshClosed();
  }, [closedOpen, refreshClosed]);

  async function applyResult(
    order: { id: string; code: number; status: OrderStatus },
    result: OrderActionResult,
    to: OrderStatus,
  ) {
    if (result.ok) {
      queue.patchOrder(order.id, result.data.status, result.data.next);
      setDetailVersion((n) => n + 1);
      pushToast("success", transitionToast(order.code, result.data.status));
      if (result.data.print && isAcceptTransition(order.status, to)) {
        try {
          setPrinting(await loadDetail(order.id));
        } catch {
          pushToast("error", `Não foi possível abrir a impressão do Pedido #${order.code}.`);
        }
      }
      return;
    }
    pushToast("error", result.message);
    if (result.error === "conflict" || result.error === "not_found") await queue.refresh();
  }

  async function advance(
    order: { id: string; code: number; status: OrderStatus },
    to: OrderStatus,
  ) {
    if (busyId) return;
    setBusyId(order.id);
    try {
      await applyResult(order, await transition({ orderId: order.id, from: order.status, to }), to);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelOrder(order: OrderDetail, reason: CancelReason | undefined) {
    if (busyId) return;
    setBusyId(order.id);
    try {
      const result = await cancel({
        orderId: order.id,
        from: order.status,
        ...(reason ? { reason } : {}),
      });
      if (result.ok) {
        const { consequence } = result.data;
        queue.patchOrder(
          order.id,
          result.data.status,
          result.data.next,
          consequence.kind === "refund" ? { state: consequence.refund.state } : null,
        );
        setDetailVersion((n) => n + 1);
        pushToast("success", cancelToast(order.code, consequence));
        // O Pedido sai das colunas e entra em Cancelados de hoje.
        await Promise.all([queue.refresh(), closedOpen ? refreshClosed() : undefined]);
        return;
      }
      pushToast("error", result.message);
      if (result.error === "conflict" || result.error === "not_found") {
        setDetailVersion((n) => n + 1);
        await queue.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  const closedGroups = {
    completed: (closed ?? []).filter((order) => order.status === "completed"),
    cancelled: (closed ?? []).filter((order) => order.status === "cancelled"),
  };

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${storefrontOrigin}/loja/${storeSlug}`);
      pushToast("success", "Link copiado.");
    } catch {
      pushToast("error", "Não foi possível copiar o link.");
    }
  }

  return (
    <section aria-label="Fila de Pedidos" className="space-y-5">
      {!queue.sound.ready ? (
        <button
          type="button"
          onClick={() => void queue.sound.unlock()}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-4 py-3 text-left text-sm font-bold text-[var(--color-primary-ink)]"
        >
          <span>
            <span aria-hidden="true">♪ </span>Clique para ativar o som de novos Pedidos
          </span>
          <span className="underline underline-offset-4">Ativar</span>
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div role="group" aria-labelledby={filterLabelId} className="flex gap-1">
          <span id={filterLabelId} className="sr-only">
            Filtrar por tipo
          </span>
          {QUEUE_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={
                filter === option
                  ? "min-h-10 rounded-full bg-[var(--color-primary-strong)] px-4 text-sm font-bold text-white"
                  : "min-h-10 rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-body)] hover:bg-[var(--color-primary-soft)]"
              }
            >
              {QUEUE_FILTER_LABEL[option]}
            </button>
          ))}
        </div>

        {loadClosed ? (
          <button
            type="button"
            aria-expanded={closedOpen}
            aria-controls={closedId}
            onClick={() => setClosedOpen((value) => !value)}
            className="min-h-10 rounded-full px-2 text-sm text-[var(--color-muted)] underline-offset-4 hover:underline"
          >
            Concluídos hoje ({queue.closedToday.completed}) · Cancelados hoje (
            {queue.closedToday.cancelled})
          </button>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Concluídos hoje ({queue.closedToday.completed}) · Cancelados hoje (
            {queue.closedToday.cancelled})
          </p>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          {queue.sound.ready ? (
            <button
              type="button"
              onClick={queue.sound.toggleMute}
              aria-pressed={queue.sound.muted}
              className="rounded-full border border-[var(--color-hairline)] px-3 py-1 font-bold text-[var(--color-body)]"
            >
              {queue.sound.muted ? "Som silenciado" : "Som ligado"}
            </button>
          ) : null}
          {queue.offline ? (
            <p role="alert" className="flex items-center gap-2 font-bold text-[var(--color-error)]">
              Sem conexão — tentando de novo
              <button
                type="button"
                onClick={() => void queue.refresh()}
                className="rounded-full border border-current px-3 py-0.5 text-xs"
              >
                Tentar de novo
              </button>
            </p>
          ) : queue.updatedAtMs !== null ? (
            <p className="text-[var(--color-muted)]">
              {formatUpdatedAgo(queue.updatedAtMs, Date.now())}
            </p>
          ) : null}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {queue.arrived.length > 0
          ? queue.arrived.length === 1
            ? "1 Pedido novo na fila."
            : `${queue.arrived.length} Pedidos novos na fila.`
          : ""}
      </p>

      <div role="tablist" aria-label="Colunas da fila" className="flex gap-1 md:hidden">
        {QUEUE_COLUMNS.map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={column === key}
            onClick={() => setColumn(key)}
            className={
              column === key
                ? "min-h-11 flex-1 rounded-full bg-[var(--color-primary-strong)] px-3 text-sm font-bold text-white"
                : "min-h-11 flex-1 rounded-full border border-[var(--color-hairline)] px-3 text-sm font-bold text-[var(--color-body)]"
            }
          >
            {QUEUE_COLUMN_LABEL[key]} ({groups[key].length})
          </button>
        ))}
      </div>

      {queue.loading ? (
        <div aria-busy="true" className="grid gap-4 md:grid-cols-3">
          {QUEUE_COLUMNS.map((key) => (
            <div
              key={key}
              className="h-40 rounded-3xl border border-dashed border-[var(--color-hairline)]"
            />
          ))}
        </div>
      ) : queue.offline && queue.updatedAtMs === null ? (
        <div
          role="alert"
          className="rounded-3xl border border-[var(--color-error)] px-6 py-10 text-center"
        >
          <p className="font-bold text-[var(--color-ink)]">Não foi possível carregar os Pedidos.</p>
          <p className="mt-1 text-sm text-[var(--color-body)]">
            Confira a conexão. A fila tenta de novo sozinha a cada 10 segundos.
          </p>
          <Button
            variant="secondary"
            type="button"
            className="mt-4"
            onClick={() => void queue.refresh()}
          >
            Tentar de novo
          </Button>
        </div>
      ) : total === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--color-hairline)] px-6 py-10 text-center">
          <p className="font-bold text-[var(--color-ink)]">Nenhum Pedido agora.</p>
          {role === "owner" ? (
            <>
              <p className="mt-1 text-sm text-[var(--color-body)]">Divulgue o link da sua Loja.</p>
              <Button
                variant="secondary"
                type="button"
                className="mt-4"
                onClick={() => void copyLink()}
              >
                Copiar link
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-body)]">
              Novos Pedidos aparecem aqui com aviso sonoro.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {QUEUE_COLUMNS.map((key) => (
            <section
              key={key}
              aria-label={`${QUEUE_COLUMN_LABEL[key]} (${groups[key].length})`}
              className={`${column === key ? "block" : "hidden"} rounded-3xl border border-[var(--color-hairline)] p-3 md:block`}
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-bold uppercase tracking-wide text-[var(--color-muted)]">
                {QUEUE_COLUMN_LABEL[key]}
                <span className="rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-xs text-[var(--color-ink)]">
                  {groups[key].length}
                </span>
              </h2>
              <ul className="mt-3 space-y-3">
                {groups[key].map((order: OrderQueueItem) => (
                  <li key={order.id}>
                    <OrderCard
                      busy={busyId === order.id}
                      isNew={order.status === "received" && !opened.has(order.id)}
                      nowMs={queue.nowMs}
                      onAdvance={(item, to) => void advance(item, to)}
                      onOpen={open}
                      order={order}
                    />
                  </li>
                ))}
                {groups[key].length === 0 ? (
                  <li className="px-1 py-6 text-center text-sm text-[var(--color-muted)]">
                    Nenhum Pedido aqui.
                  </li>
                ) : null}
              </ul>
            </section>
          ))}
        </div>
      )}

      {closedOpen && loadClosed ? (
        <section
          id={closedId}
          aria-label="Concluídos e Cancelados de hoje"
          className="rounded-3xl border border-[var(--color-hairline)] p-3"
        >
          {closedFailed && closed === null ? (
            <p role="alert" className="px-1 py-4 text-sm font-bold text-[var(--color-error)]">
              Não foi possível carregar os Pedidos de hoje.
            </p>
          ) : closed === null ? (
            <p aria-busy="true" className="px-1 py-4 text-sm text-[var(--color-muted)]">
              Carregando...
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(["completed", "cancelled"] as const).map((key) => (
                <section
                  key={key}
                  aria-label={`${CLOSED_LABEL[key]} (${closedGroups[key].length})`}
                >
                  <h2 className="flex items-center justify-between px-1 text-sm font-bold uppercase tracking-wide text-[var(--color-muted)]">
                    {CLOSED_LABEL[key]}
                    <span className="rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-xs text-[var(--color-ink)]">
                      {closedGroups[key].length}
                    </span>
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {closedGroups[key].map((order) => (
                      <li key={order.id}>
                        <OrderCard
                          busy={false}
                          isNew={false}
                          nowMs={queue.nowMs}
                          onAdvance={() => undefined}
                          onOpen={open}
                          order={order}
                        />
                      </li>
                    ))}
                    {closedGroups[key].length === 0 ? (
                      <li className="px-1 py-6 text-center text-sm text-[var(--color-muted)]">
                        Nenhum Pedido aqui.
                      </li>
                    ) : null}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {selectedId ? (
        <OrderDetailPanel
          busy={busyId === selectedId}
          loadDetail={loadDetail}
          onAdvance={(order, to) => advance(order, to)}
          onCancel={cancelOrder}
          onClose={close}
          onPrint={setPrinting}
          orderId={selectedId}
          storeName={storeName}
          storefrontOrigin={storefrontOrigin}
          version={detailVersion}
        />
      ) : null}

      {printing ? (
        <PrintReceipt onDone={donePrinting} order={printing} storeName={storeName} />
      ) : null}

      {tour.open && tourEnabled ? <QueueTour onFinish={tour.finish} /> : null}
    </section>
  );
}
