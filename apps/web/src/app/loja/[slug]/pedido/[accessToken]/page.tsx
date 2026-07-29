import {
  orderStatusLabelPt,
  orderStatusSchema,
  type OrderStatus,
} from "@foode/shared";
import { OutlineContainer } from "@foode/ui";
import { notFound } from "next/navigation";

type PublicOrderLine = {
  additionalSnapshots: Array<{ name: string; priceCents: number }>;
  complementSnapshots: Array<{ groupName: string; optionName: string }>;
  itemName: string;
  lineTotalCents: number;
  quantity: number;
};

type PublicOrderTracking = {
  order: {
    deliveryAddress?: {
      complement: string | null;
      neighborhood: string;
      reference: string | null;
      streetLine: string;
    } | null;
    deliveryFeeCents?: number;
    fulfillmentType?: "pickup" | "delivery";
    lines: PublicOrderLine[];
    paymentMethod?: "pix" | "on_delivery";
    paymentStatus?: "not_required" | "awaiting_payment" | "paid";
    pix?: {
      brCode: string;
      qrCodeImage: string;
      status: string;
    } | null;
    publicCode: string;
    status: OrderStatus;
    totalCents: number;
  };
  store: {
    name: string;
    slug: string;
  };
  whatsappUrl: string | null;
};

function apiUrl() {
  const value = process.env.API_URL?.trim();
  if (!value) throw new Error("API_URL_is_required");
  return value;
}

function formatPrice(priceCents: number) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

async function loadOrderTracking(
  accessToken: string,
): Promise<PublicOrderTracking | null> {
  const response = await fetch(
    new URL(
      `/public/orders/${encodeURIComponent(accessToken)}`,
      apiUrl(),
    ),
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("order_tracking_request_failed");

  const payload = (await response.json()) as Partial<PublicOrderTracking>;
  const status = orderStatusSchema.safeParse(payload.order?.status);
  if (
    !payload.order?.publicCode ||
    !status.success ||
    !Array.isArray(payload.order.lines) ||
    typeof payload.order.totalCents !== "number" ||
    !payload.store?.name ||
    !payload.store.slug
  ) {
    throw new Error("order_tracking_response_invalid");
  }

  return {
    order: {
      deliveryAddress: payload.order.deliveryAddress ?? null,
      ...(typeof payload.order.deliveryFeeCents === "number"
        ? { deliveryFeeCents: payload.order.deliveryFeeCents }
        : {}),
      fulfillmentType: payload.order.fulfillmentType ?? "pickup",
      lines: payload.order.lines,
      ...(payload.order.paymentMethod
        ? { paymentMethod: payload.order.paymentMethod }
        : {}),
      ...(payload.order.paymentStatus
        ? { paymentStatus: payload.order.paymentStatus }
        : {}),
      ...(payload.order.pix ? { pix: payload.order.pix } : {}),
      publicCode: payload.order.publicCode,
      status: status.data,
      totalCents: payload.order.totalCents,
    },
    store: {
      name: payload.store.name,
      slug: payload.store.slug,
    },
    whatsappUrl:
      typeof payload.whatsappUrl === "string" ? payload.whatsappUrl : null,
  };
}

export default async function PublicOrderTrackingPage({
  params,
}: {
  params: Promise<{ accessToken: string; slug: string }>;
}) {
  const { accessToken, slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const token = accessToken.trim();
  if (!normalizedSlug || !token) notFound();

  const tracking = await loadOrderTracking(token);
  if (!tracking || tracking.store.slug !== normalizedSlug) notFound();

  return (
    <main className="min-h-[100dvh] bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-hairline)] px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-bold text-[var(--color-primary-active)]">
            Foode
          </p>
          <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            Pedido #{tracking.order.publicCode}
          </h1>
          <p className="mt-2 max-w-[48ch] text-[var(--color-body)]">
            Acompanhe o andamento na {tracking.store.name}.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <OutlineContainer className="p-5 md:p-6">
          <p className="text-sm font-bold text-[var(--color-primary-active)]">
            Status
          </p>
          <h2 className="mt-1 text-xl font-bold text-[var(--color-ink)]">
            {orderStatusLabelPt(tracking.order.status)}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Modalidade:{" "}
            {tracking.order.fulfillmentType === "delivery"
              ? "Delivery"
              : "Retirada"}{" "}
            ·{" "}
            {tracking.order.paymentMethod === "pix"
              ? tracking.order.paymentStatus === "paid"
                ? "PIX pago"
                : "PIX"
              : "Pagamento na entrega"}
          </p>

          {tracking.order.paymentMethod === "pix" &&
          tracking.order.pix &&
          tracking.order.paymentStatus !== "paid" ? (
            <div className="mt-4 rounded-xl border border-[var(--color-hairline)] px-3 py-4">
              <p className="text-sm font-bold text-[var(--color-ink)]">
                Pague com PIX
              </p>
              <img
                alt="QR Code PIX"
                className="mx-auto mt-3 h-48 w-48 rounded-xl border border-[var(--color-hairline)]"
                height={192}
                src={tracking.order.pix.qrCodeImage}
                width={192}
              />
              <label className="mt-4 block text-sm font-bold text-[var(--color-ink)]">
                Copia e cola
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-[var(--color-hairline)] px-3 py-2 font-mono text-xs text-[var(--color-body)]"
                  readOnly
                  value={tracking.order.pix.brCode}
                />
              </label>
            </div>
          ) : null}

          {tracking.order.deliveryAddress ? (
            <div className="mt-4 rounded-xl border border-[var(--color-hairline)] px-3 py-3 text-sm text-[var(--color-body)]">
              <p className="font-bold text-[var(--color-ink)]">Entrega</p>
              <p className="mt-1">{tracking.order.deliveryAddress.streetLine}</p>
              <p>{tracking.order.deliveryAddress.neighborhood}</p>
              {typeof tracking.order.deliveryFeeCents === "number" ? (
                <p className="mt-2">
                  Taxa: {formatPrice(tracking.order.deliveryFeeCents)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            {tracking.order.lines.map((line, index) => (
              <div
                className="border-t border-[var(--color-hairline-soft)] pt-4"
                key={`${line.itemName}-${index}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-[var(--color-ink)]">
                      {line.quantity}× {line.itemName}
                    </h3>
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
                  <strong className="shrink-0 text-[var(--color-primary-active)]">
                    {formatPrice(line.lineTotalCents)}
                  </strong>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-[var(--color-hairline)] pt-4 text-lg font-bold text-[var(--color-ink)]">
            <span>Total</span>
            <span>{formatPrice(tracking.order.totalCents)}</span>
          </div>

          {tracking.whatsappUrl ? (
            <a
              className="mt-6 flex min-h-12 items-center justify-center rounded-full border border-[var(--color-hairline)] px-5 font-bold text-[var(--color-body)] active:translate-y-px"
              href={tracking.whatsappUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Falar no WhatsApp
            </a>
          ) : null}

          <a
            className="mt-3 flex min-h-12 items-center justify-center rounded-full bg-[var(--color-primary)] px-5 font-bold text-white active:translate-y-px"
            href={`/loja/${encodeURIComponent(tracking.store.slug)}`}
          >
            Voltar ao Cardápio
          </a>
        </OutlineContainer>
      </div>
    </main>
  );
}
