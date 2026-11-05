"use client";

// Página do Pedido por token (§6 das diretrizes, Ticket 24a): status na linguagem do
// Consumidor com atualização periódica em `aria-live`, passos do Fulfillment, tempo
// estimado, itens em snapshot, totais, pagamento (com troco) e `wa.me` "Falar com a Loja".
// Ticket 26: Pedido PIX ainda não pago mostra o bloco do PIX no lugar dos passos (a Loja só
// recebe depois do pagamento) e atualiza a cada PIX_POLL_INTERVAL_MS; tarifa de serviço do
// pagamento online (decisão 71) em linha própria; oferta de conta para quem não entrou.
// Ticket 27: Pedido por Cartão ainda não aprovado mostra o bloco do Cartão (processando / em
// análise / recusado com ações) no lugar dos passos, com a mesma cadência de consulta do PIX.
// "Pagar com PIX" depois da recusa troca o Pedido para PIX e recarrega o estado aqui mesmo: o
// bloco do PIX entra no lugar do bloco do Cartão, sem refazer o pedido.
import { buildWhatsAppMeUrl } from "@foode/shared";
import { formatBRL } from "@foode/shared/money";
import {
  ORDER_TRACKING_POLL_INTERVAL_MS,
  formatEtaPt,
  isFinalStatus,
  orderStatusConsumerLabelPt,
  orderTrackingSchema,
  paymentMethodLabelPt,
  statusesOf,
  type OrderStatus,
  type OrderTracking,
} from "@foode/shared/order";
import {
  PIX_POLL_INTERVAL_MS,
  SERVICE_FEE_LABEL_PT,
  isCardAwaiting,
  isPixAwaiting,
  type OrderCard,
  type OrderPix,
} from "@foode/shared/payment";
import { Badge, Button, OutlineContainer } from "@foode/ui";
import { CheckCircle, Circle, WhatsappLogo } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import {
  firePixelEvent,
  pixelSafeOrderPath,
  purchaseSentKey,
  type PixelIds,
  type PixelWindow,
} from "../../storefront/pixels";
import type { CardSdkFactory } from "../../finalizar/card-tokenizer";
import { AccountOffer, type AccountOfferProps } from "./account-offer";
import type { CardRetryApi } from "./card-api";
import { CardPayment } from "./card-payment";
import { PixPayment } from "./pix-payment";

export type OrderTrackingViewProps = {
  initial: OrderTracking;
  /** Injetável nos testes; por padrão `fetch` em `/loja/{slug}/pedido/{token}/acompanhar`. */
  load?: () => Promise<OrderTracking | null>;
  /** Pixel da Loja: `purchase` uma vez por Pedido neste aparelho (valor e moeda). */
  pixels?: PixelIds | null;
  pollIntervalMs?: number;
  /** Intervalo enquanto o PIX aguarda pagamento. */
  pixPollIntervalMs?: number;
  /** Oferta de conta (decisão 71): só para quem não entrou e com login disponível. */
  accountOffer?: Omit<AccountOfferProps, "storeSlug"> | null;
  /** Bloco do PIX: relógio e cópia injetáveis nos testes. */
  pixNow?: () => number;
  copy?: (text: string) => Promise<void>;
  /** Bloco do Cartão (Ticket 27): api da nova tentativa e SDK injetáveis nos testes. */
  cardApi?: CardRetryApi;
  cardSdkFactory?: CardSdkFactory;
  /** CPF mascarado da conta do Consumidor logado (decisão 65), para a nova tentativa. */
  accountCpfMasked?: string | null;
  storeSlug: string;
  token: string;
};

/** PIX que ainda não confirmou: a Loja não recebeu o Pedido. */
function unpaidPix(pix: OrderPix | null): OrderPix | null {
  return pix && pix.state !== "paid" ? pix : null;
}

/** Cartão ainda não aprovado (processando, em análise ou recusado): idem. */
function unpaidCard(card: OrderCard | null): OrderCard | null {
  return card && card.state !== "approved" ? card : null;
}

export function trackingPollPath(storeSlug: string, token: string): string {
  return `/loja/${encodeURIComponent(storeSlug)}/pedido/${encodeURIComponent(token)}/acompanhar`;
}

async function fetchTracking(storeSlug: string, token: string): Promise<OrderTracking | null> {
  try {
    const response = await fetch(trackingPollPath(storeSlug, token), { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = orderTrackingSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Passos visíveis na linha do tempo (sem "cancelado": vira selo). */
function timelineOf(order: Pick<OrderTracking, "fulfillment">): OrderStatus[] {
  return statusesOf(order.fulfillment).filter((status) => status !== "cancelled");
}

function stepLabel(status: OrderStatus, fulfillment: OrderTracking["fulfillment"]): string {
  switch (status) {
    case "received":
      return "Recebido";
    case "preparing":
      return "Em preparo";
    case "ready_for_pickup":
      return "Pronto para retirar";
    case "out_for_delivery":
      return "Saiu para entrega";
    case "completed":
      return fulfillment === "delivery" ? "Entregue" : "Retirado";
    case "cancelled":
      return "Cancelado";
  }
}

export function OrderTrackingView({
  accountCpfMasked = null,
  accountOffer = null,
  cardApi,
  cardSdkFactory,
  copy,
  initial,
  load,
  pixNow,
  pixPollIntervalMs = PIX_POLL_INTERVAL_MS,
  pixels = null,
  pollIntervalMs = ORDER_TRACKING_POLL_INTERVAL_MS,
  storeSlug,
  token,
}: OrderTrackingViewProps) {
  const [order, setOrder] = useState(initial);
  const final = isFinalStatus(order.status);
  const pendingPix = unpaidPix(order.pix);
  const pendingCard = unpaidCard(order.card);
  /** Pagamento online ainda não confirmado: a Loja não recebeu o Pedido. */
  const pendingPayment = pendingPix !== null || pendingCard !== null;
  const awaitingPayment =
    (pendingPix !== null && isPixAwaiting(pendingPix.state)) ||
    (pendingCard !== null && isCardAwaiting(pendingCard.state));
  const loader = useCallback(
    () => (load ?? (() => fetchTracking(storeSlug, token)))(),
    [load, storeSlug, token],
  );

  // `purchase` só com o Pedido de fato enviado à Loja (PIX pago ou sem pagamento online).
  useEffect(() => {
    if (!pixels || initial.status === "cancelled" || pendingPayment) return;
    const key = purchaseSentKey(storeSlug, initial.code);
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sem storage: dispara mesmo assim
    }
    // A URL desta página tem o token do Pedido: Meta e Google só recebem a URL sem ele.
    firePixelEvent(
      window as PixelWindow,
      pixels,
      { name: "purchase", orderCode: initial.code, valueCents: initial.totalCents },
      {
        safePageUrl: `${window.location.origin}${pixelSafeOrderPath(storeSlug)}`,
        beacon: (url) => {
          const image = new Image();
          image.referrerPolicy = "no-referrer";
          image.src = url;
        },
      },
    );
  }, [initial.code, initial.status, initial.totalCents, pendingPayment, pixels, storeSlug]);

  const interval = awaitingPayment ? pixPollIntervalMs : pollIntervalMs;
  useEffect(() => {
    if (final) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void loader().then((next) => {
        if (next && !cancelled) setOrder(next);
      });
    }, interval);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [final, interval, loader]);

  // Nova tentativa aceita: mostra "Processando" já e consulta o estado em seguida.
  function handleCardRetried() {
    setOrder((current) =>
      current.card
        ? {
            ...current,
            card: {
              ...current.card,
              declineReason: null,
              retryActions: [],
              state: "processing",
            },
          }
        : current,
    );
    void loader().then((next) => {
      if (next) setOrder(next);
    });
  }

  // "Pagar com PIX" aceito: o Pedido agora é PIX; recarrega para trocar o bloco (true = trocou).
  async function handlePixSwitched(): Promise<boolean> {
    const next = await loader();
    if (!next) return false;
    setOrder(next);
    return next.pix !== null;
  }

  const timeline = timelineOf(order);
  const currentIndex = timeline.indexOf(order.status);
  const cancelled = order.status === "cancelled";
  const whatsapp = order.store.whatsapp
    ? buildWhatsAppMeUrl(
        order.store.whatsapp,
        `Olá! Sobre o pedido #${order.code} na ${order.store.name}.`,
      )
    : null;
  const menuHref = `/loja/${encodeURIComponent(order.store.slug)}`;
  const chargedCents = order.totalCents + order.serviceFeeCents;

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-hairline)] px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            {order.store.name}
          </p>
          <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            Pedido #{order.code}
          </h1>
          <p className="mt-1 text-[var(--color-body)]">
            {order.customerFirstName}, acompanhe seu pedido por aqui.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6 md:px-8">
        <OutlineContainer as="section" aria-labelledby="pedido-status" className="p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            {pendingPayment ? "Pagamento" : "Status"}
          </p>
          {pendingPix ? (
            <div className="mt-1">
              <PixPayment
                {...(copy ? { copy } : {})}
                {...(pixNow ? { now: pixNow } : {})}
                menuHref={menuHref}
                pix={pendingPix}
              />
            </div>
          ) : null}
          {pendingCard ? (
            <div className="mt-1">
              <CardPayment
                {...(cardApi ? { api: cardApi } : {})}
                {...(cardSdkFactory ? { sdkFactory: cardSdkFactory } : {})}
                {...(pixNow ? { now: pixNow } : {})}
                card={pendingCard}
                cpfMasked={accountCpfMasked}
                customerName={order.customerFirstName}
                onPixSwitched={handlePixSwitched}
                onRetried={handleCardRetried}
                storeSlug={storeSlug}
                token={token}
              />
            </div>
          ) : null}
          {pendingPayment ? null : (
            <h2
              aria-live="polite"
              className="mt-1 text-xl font-bold text-[var(--color-ink)]"
              id="pedido-status"
            >
              {orderStatusConsumerLabelPt(order.fulfillment, order.status)}
            </h2>
          )}
          {order.pix?.state === "paid" || order.card?.state === "approved" ? (
            <p className="mt-1 text-sm text-[var(--color-body)]">Pagamento confirmado.</p>
          ) : null}
          {pendingPayment ? null : cancelled ? (
            <Badge className="mt-2" tone="error">
              Cancelado
            </Badge>
          ) : (
            <ol className="mt-4 grid gap-2" role="list">
              {timeline.map((status, index) => {
                const done = index <= currentIndex;
                const Icon = done ? CheckCircle : Circle;
                return (
                  <li
                    aria-current={index === currentIndex ? "step" : undefined}
                    className={[
                      "flex items-center gap-2 text-sm",
                      done ? "font-bold text-[var(--color-ink)]" : "text-[var(--color-muted)]",
                    ].join(" ")}
                    key={status}
                  >
                    <Icon
                      aria-hidden
                      className={
                        done ? "text-[var(--color-primary)]" : "text-[var(--color-hairline)]"
                      }
                      size={20}
                      weight={done ? "fill" : "regular"}
                    />
                    {stepLabel(status, order.fulfillment)}
                  </li>
                );
              })}
            </ol>
          )}
          {order.eta && !final && !pendingPayment ? (
            <p className="mt-4 text-sm text-[var(--color-body)]">
              Previsão: {formatEtaPt(order.eta)}{" "}
              {order.fulfillment === "delivery" ? "para entregar" : "para retirar"}
            </p>
          ) : null}
          {!final && !pendingPayment ? (
            <p className="mt-1 text-xs text-[var(--color-muted)]">Esta página atualiza sozinha.</p>
          ) : null}
        </OutlineContainer>

        <OutlineContainer as="section" aria-labelledby="pedido-itens" className="p-5">
          <h2
            className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]"
            id="pedido-itens"
          >
            Itens
          </h2>
          <ul className="mt-3 grid gap-3" role="list">
            {order.lines.map((line, index) => (
              <li
                className="flex items-start justify-between gap-3"
                key={`${line.itemName}-${index}`}
              >
                <div className="min-w-0">
                  <p className="font-bold text-[var(--color-ink)]">
                    <span className="tabular-nums">{line.quantity}×</span> {line.itemName}
                  </p>
                  {line.complements.map((c) => (
                    <p
                      className="text-sm text-[var(--color-body)]"
                      key={`${c.groupName}-${c.optionName}`}
                    >
                      {c.groupName}: {c.optionName}
                      {c.priceCents > 0 ? ` +${formatBRL(c.priceCents)}` : ""}
                    </p>
                  ))}
                  {line.additionals.map((a) => (
                    <p className="text-sm text-[var(--color-body)]" key={a.name}>
                      {a.name} +{formatBRL(a.priceCents)}
                    </p>
                  ))}
                </div>
                <span className="shrink-0 tabular-nums text-[var(--color-ink)]">
                  {formatBRL(line.totalCents)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid gap-1 border-t border-[var(--color-hairline-soft)] pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--color-body)]">Subtotal</dt>
              <dd className="m-0 tabular-nums">{formatBRL(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-body)]">
                {order.fulfillment === "pickup" ? "Retirada" : "Taxa de entrega"}
              </dt>
              <dd className="m-0 tabular-nums">
                {order.fulfillment === "pickup" ? "grátis" : formatBRL(order.deliveryFeeCents)}
              </dd>
            </div>
            {order.discountCents > 0 ? (
              <div className="flex justify-between">
                <dt className="text-[var(--color-body)]">Desconto</dt>
                <dd className="m-0 tabular-nums">−{formatBRL(order.discountCents)}</dd>
              </div>
            ) : null}
            {order.serviceFeeCents > 0 ? (
              <div className="flex justify-between">
                <dt className="text-[var(--color-body)]">{SERVICE_FEE_LABEL_PT}</dt>
                <dd className="m-0 tabular-nums">{formatBRL(order.serviceFeeCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold text-[var(--color-ink)]">
              <dt>Total</dt>
              <dd className="m-0 tabular-nums">{formatBRL(chargedCents)}</dd>
            </div>
          </dl>
        </OutlineContainer>

        <OutlineContainer as="section" aria-labelledby="pedido-detalhes" className="grid gap-3 p-5">
          <h2
            className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]"
            id="pedido-detalhes"
          >
            {order.fulfillment === "delivery" ? "Entrega e pagamento" : "Retirada e pagamento"}
          </h2>
          {order.address ? (
            <p className="text-sm text-[var(--color-body)]">
              <span className="font-bold text-[var(--color-ink)]">
                {order.address.street}, {order.address.number}
              </span>
              {order.address.complement ? ` · ${order.address.complement}` : ""}
              <br />
              {order.address.neighborhood}
              {order.address.reference ? ` · ${order.address.reference}` : ""}
            </p>
          ) : (
            <p className="text-sm text-[var(--color-body)]">Retirada na {order.store.name}.</p>
          )}
          <p className="text-sm text-[var(--color-body)]">
            <span className="font-bold text-[var(--color-ink)]">
              {paymentMethodLabelPt(order.payment.method)}
            </span>
            {order.payment.changeForCents !== null
              ? ` · troco para ${formatBRL(order.payment.changeForCents)}`
              : ""}
          </p>
          {order.note ? (
            <p className="text-sm text-[var(--color-body)]">
              <span className="font-bold text-[var(--color-ink)]">Observação:</span> {order.note}
            </p>
          ) : null}
        </OutlineContainer>

        {accountOffer ? <AccountOffer {...accountOffer} storeSlug={order.store.slug} /> : null}

        <div className="grid gap-3">
          {whatsapp ? (
            <Button href={whatsapp} rel="noopener noreferrer" target="_blank" variant="secondary">
              <span className="inline-flex items-center gap-2">
                <WhatsappLogo aria-hidden size={20} weight="bold" />
                Falar com a Loja
              </span>
            </Button>
          ) : null}
          <Button href={menuHref} variant={whatsapp ? "secondary" : "primary"}>
            Voltar ao Cardápio
          </Button>
        </div>
      </div>
    </main>
  );
}
