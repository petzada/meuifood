"use client";

// Tour de 3 passos na primeira visita à fila (P-ONB-1): Pedido fictício só na tela (nada gravado),
// pulável e que não se repete para o mesmo usuário (localStorage). Sem Pedido de teste real
// (P-ONB-2).
import { Button, OutlineContainer } from "@foode/ui";
import type { OrderQueueItem } from "@foode/shared/order";
import { useEffect, useId, useState } from "react";

import { tourStorageKey } from "../../../../lib/orders-labels";
import { OrderCard } from "./order-card";

export const TOUR_ORDER: OrderQueueItem = {
  id: "tour-exemplo",
  code: 0,
  status: "received",
  fulfillment: "delivery",
  createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  customerName: "Pedido de exemplo",
  neighborhood: "Centro",
  paymentMethod: "pix",
  totalCents: 5490,
  next: ["preparing"],
};

const STEPS = [
  {
    title: "Os Pedidos novos chegam aqui",
    text: "Cada Pedido vira um card em Recebidos, com som e aviso na aba do navegador. Este é um exemplo: nada foi gravado.",
  },
  {
    title: "Um botão, um destino",
    text: "O botão do card diz para onde o Pedido vai: Começar preparo, Marcar como Saiu para entrega ou Pronto para retirada, Concluir.",
  },
  {
    title: "Detalhe, impressão e WhatsApp",
    text: "Toque no código do Pedido para ver itens, endereço, troco e telefone, imprimir o cupom 80 mm ou avisar o Consumidor no WhatsApp.",
  },
] as const;

export function useQueueTour(userId: string, storage: Storage | null) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!storage) return;
    try {
      if (!storage.getItem(tourStorageKey(userId))) setOpen(true);
    } catch {
      // Sem localStorage (modo privado restrito): o tour simplesmente não abre.
    }
  }, [storage, userId]);
  const finish = () => {
    setOpen(false);
    try {
      storage?.setItem(tourStorageKey(userId), new Date().toISOString());
    } catch {
      // idem
    }
  };
  return { open, finish };
}

export function QueueTour({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const titleId = useId();
  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <OutlineContainer className="w-full max-w-md bg-[var(--color-canvas)] p-6">
        <p className="text-sm font-bold text-[var(--color-primary-strong)]">
          Passo {step + 1} de {STEPS.length}
        </p>
        <h2
          id={titleId}
          className="mt-1 text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]"
        >
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">{current.text}</p>
        <div className="mt-4" aria-hidden="true">
          <OrderCard
            busy={false}
            isNew
            nowMs={Date.now()}
            onAdvance={() => undefined}
            onOpen={() => undefined}
            order={TOUR_ORDER}
          />
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <Button variant="secondary" type="button" onClick={onFinish}>
            Pular tour
          </Button>
          <Button type="button" onClick={() => (last ? onFinish() : setStep(step + 1))}>
            {last ? "Começar" : "Próximo"}
          </Button>
        </div>
      </OutlineContainer>
    </div>
  );
}
