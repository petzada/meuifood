"use client";

// Liga a fila aos route handlers do admin (`/api/pedidos`): o navegador busca a lista e o detalhe
// com o cookie da sessão; avançar e cancelar vão por server action. A página (RSC) só passa
// papel, Loja e as actions.
import type { OrderDetail, OrdersList } from "@foode/shared/order";

import { QueueBoard, type QueueBoardProps } from "./queue-board";

async function loadList(): Promise<OrdersList> {
  const response = await fetch("/api/pedidos?filter=all&scope=active", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`fila: ${response.status}`);
  return (await response.json()) as OrdersList;
}

async function loadDetail(orderId: string): Promise<OrderDetail> {
  const response = await fetch(`/api/pedidos/${encodeURIComponent(orderId)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`pedido: ${response.status}`);
  return (await response.json()) as OrderDetail;
}

export function QueueApp(props: Omit<QueueBoardProps, "loadDetail" | "loadList">) {
  return <QueueBoard {...props} loadDetail={loadDetail} loadList={loadList} />;
}
