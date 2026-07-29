import { OutlineContainer } from "@foode/ui";
import { notFound } from "next/navigation";

import {
  StorefrontCatalog,
  type PublicDeliveryConfig,
  type PublicMenuCategory,
} from "./storefront-cart";
import {
  type PublicStoreOperation,
  StoreOperationStatus,
} from "./store-operation-status";

type PublicStorefront = {
  categories: PublicMenuCategory[];
  delivery?: PublicDeliveryConfig;
  name: string;
  operation: PublicStoreOperation;
  pickupEnabled?: boolean;
  slug: string;
};

function apiUrl() {
  const value = process.env.API_URL?.trim();
  if (!value) throw new Error("API_URL_is_required");
  return value;
}

function resolveDelivery(storefront: PublicStorefront): PublicDeliveryConfig {
  if (storefront.delivery) return storefront.delivery;
  return {
    deliveryAvailable: false,
    fixedDeliveryFeeCents: null,
    mode: null,
    neighborhoods: [],
    pickupEnabled: storefront.pickupEnabled ?? true,
  };
}

async function loadStorefront(slug: string): Promise<PublicStorefront | null> {
  const response = await fetch(
    new URL(`/public/stores/${encodeURIComponent(slug)}/menu`, apiUrl()),
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("storefront_request_failed");
  const payload = (await response.json()) as { storefront?: PublicStorefront };
  if (
    !payload.storefront?.slug ||
    !Array.isArray(payload.storefront.categories) ||
    !payload.storefront.operation?.state
  ) {
    throw new Error("storefront_response_invalid");
  }
  return payload.storefront;
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) notFound();

  const storefront = await loadStorefront(normalized);
  if (!storefront) notFound();

  const delivery = resolveDelivery(storefront);
  const checkoutAllowed = storefront.operation.checkout.allowed;

  return (
    <main className="min-h-[100dvh] bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-hairline)] px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-bold text-[var(--color-primary-active)]">Foode</p>
          <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            {storefront.name}
          </h1>
          <p className="mt-2 max-w-[48ch] text-[var(--color-body)]">
            Consulte o Cardápio e escolha entre os itens disponíveis.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <StoreOperationStatus operation={storefront.operation} />
        {storefront.categories.length === 0 ? (
          <OutlineContainer className="p-6">
            <h2 className="text-xl font-bold text-[var(--color-ink)]">Cardápio em preparação</h2>
            <p className="mt-2 text-[var(--color-muted)]">
              Esta Loja ainda não publicou itens disponíveis.
            </p>
          </OutlineContainer>
        ) : (
          <StorefrontCatalog
            apiUrl={apiUrl()}
            categories={storefront.categories}
            checkoutAllowed={checkoutAllowed}
            delivery={delivery}
            storeSlug={storefront.slug}
          />
        )}
      </div>
    </main>
  );
}
