"use client";

// Liga a fila aos route handlers do admin (`/api/pedidos`): o navegador busca a lista e o detalhe
// com o cookie da sessão; avançar e cancelar vão por server action. A página (RSC) só passa
// papel, Loja e as actions.
//
// Item 8 do feedback ("Pedidos não carrega"): toda busca tem tempo-limite (uma request pendurada
// prendia o polling para sempre: o `inFlight` nunca soltava) e sessão expirada (401) volta para
// o login em vez de deixar a fila vazia.
import type { OrderDetail, OrdersList } from "@foode/shared/order";

import { QueueBoard, type QueueBoardProps } from "./queue-board";

/** Tempo-limite de cada busca da fila (o polling é de 10 s). */
export const QUEUE_FETCH_TIMEOUT_MS = 15_000;

async function getJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(QUEUE_FETCH_TIMEOUT_MS),
  });
  if (response.status === 401) {
    window.location.assign(`/entrar?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!response.ok) throw new Error(`${label}: ${response.status}`);
  return (await response.json()) as T;
}

function loadList(): Promise<OrdersList> {
  return getJson<OrdersList>("/api/pedidos?filter=all&scope=active", "fila");
}

function loadDetail(orderId: string): Promise<OrderDetail> {
  return getJson<OrderDetail>(`/api/pedidos/${encodeURIComponent(orderId)}`, "pedido");
}

export function QueueApp(props: Omit<QueueBoardProps, "loadDetail" | "loadList">) {
  return <QueueBoard {...props} loadDetail={loadDetail} loadList={loadList} />;
}
