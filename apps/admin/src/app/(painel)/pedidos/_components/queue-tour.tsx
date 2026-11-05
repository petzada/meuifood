"use client";

// Tour de 3 passos na primeira visita à fila (P-ONB-1; feedback do Dono, item 5): Pedido
// fictício só na tela (nada gravado), pulável e que não se repete para o mesmo usuário
// (localStorage). Overlay escurecido e desfocado, caixa branca sólida, foco preso, Esc fecha.
// Cada passo tem a própria ilustração (inerte: não recebe foco nem clique) e os próprios botões;
// transição curta entre passos, desligada com `prefers-reduced-motion` (globals.css).
import { Button } from "@foode/ui";
import type { OrderQueueItem } from "@foode/shared/order";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { OverlayDialog } from "../../../../components/overlay-dialog";
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

const noop = () => undefined;

function Column({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-3xl border border-[var(--color-hairline)] p-3">
      <p className="px-1 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function StepReceived({ nowMs }: { nowMs: number }) {
  return (
    <Column title="Recebidos">
      <OrderCard
        busy={false}
        isNew
        nowMs={nowMs}
        onAdvance={noop}
        onOpen={noop}
        order={TOUR_ORDER}
      />
    </Column>
  );
}

function StepAdvance({ nowMs }: { nowMs: number }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-muted)]">
        <span className="rounded-full border border-[var(--color-hairline)] px-3 py-1">
          Recebidos
        </span>
        <span aria-hidden="true">→</span>
        <span className="rounded-full border border-[var(--color-primary)] px-3 py-1 text-[var(--color-primary-strong)]">
          Em preparo
        </span>
      </p>
      <Column title="Em preparo">
        <OrderCard
          busy={false}
          isNew={false}
          nowMs={nowMs}
          onAdvance={noop}
          onOpen={noop}
          order={{ ...TOUR_ORDER, status: "preparing", next: ["out_for_delivery"] }}
        />
      </Column>
    </div>
  );
}

function StepDetail() {
  return (
    <div className="rounded-3xl border border-[var(--color-hairline)] p-4">
      <p className="text-lg font-bold text-[var(--color-ink)]">Pedido #0</p>
      <p className="text-sm text-[var(--color-body)]">Pedido de exemplo · Delivery · Centro</p>
      <ul className="mt-3 space-y-1 text-sm text-[var(--color-body)]">
        <li>2× X-Burger · Bacon</li>
        <li>Rua das Flores, 123 · Troco para R$ 60,00</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="foode-button foode-button--secondary min-h-10 px-4 text-sm">Imprimir</span>
        <span className="foode-button foode-button--secondary min-h-10 px-4 text-sm">
          Avisar no WhatsApp
        </span>
        <span className="inline-flex min-h-10 items-center rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-error)]">
          Cancelar
        </span>
      </div>
    </div>
  );
}

export const TOUR_STEPS = [
  {
    title: "Os Pedidos novos chegam aqui",
    text: "Cada Pedido vira um card em Recebidos, com o selo Novo, som e aviso na aba do navegador. Este é um exemplo: nada foi gravado.",
  },
  {
    title: "Um botão, um destino",
    text: "Começar preparo leva o Pedido para Em preparo. Lá o botão já diz o próximo passo: Marcar como Saiu para entrega (ou Pronto para retirada) e depois Concluir.",
  },
  {
    title: "Detalhe, impressão e WhatsApp",
    text: "Toque no código do Pedido para abrir o detalhe: itens, endereço, troco e telefone. Dali você imprime o cupom 80 mm, avisa o Consumidor no WhatsApp ou cancela.",
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
  const [nowMs] = useState(() => Date.now());
  const titleId = useId();
  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  const actions = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Ao trocar de passo o botão clicado sai da tela: o foco vai para a ação principal do passo.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    actions.current?.querySelector<HTMLElement>("button:last-child")?.focus();
  }, [step]);

  return (
    <OverlayDialog labelledBy={titleId} onClose={onFinish} className="max-w-md">
      <div key={step} className="foode-step-in">
        <p className="text-sm font-bold text-[var(--color-primary-strong)]">
          Passo {step + 1} de {TOUR_STEPS.length}
        </p>
        <h2
          id={titleId}
          className="mt-1 text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]"
        >
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">{current.text}</p>
        <div className="mt-4" aria-hidden="true" inert data-testid={`tour-ilustracao-${step + 1}`}>
          {step === 0 ? <StepReceived nowMs={nowMs} /> : null}
          {step === 1 ? <StepAdvance nowMs={nowMs} /> : null}
          {step === 2 ? <StepDetail /> : null}
        </div>
        <div ref={actions} className="mt-5 flex flex-wrap justify-between gap-3">
          {step === 0 ? (
            <>
              <Button variant="secondary" type="button" onClick={onFinish}>
                Pular tour
              </Button>
              <Button type="button" onClick={() => setStep(1)}>
                Próximo
              </Button>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Button variant="secondary" type="button" onClick={() => setStep(0)}>
                Voltar
              </Button>
              <Button type="button" onClick={() => setStep(2)}>
                Próximo
              </Button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Button variant="secondary" type="button" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button type="button" onClick={onFinish}>
                Começar a usar
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </OverlayDialog>
  );
}
