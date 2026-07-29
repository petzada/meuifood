"use client";

import {
  assertSingleStoreCart,
  cartContractSchema,
  createEmptyCart,
  previewCartTotalCents,
  previewLineTotalCents,
  validateCartLineChoices,
  type CartContract,
  type CartLineContract,
  type CatalogItemForCart,
} from "@foode/shared";
import { OutlineContainer } from "@foode/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

export type PublicAdditional = {
  id: string;
  name: string;
  priceCents: number;
};

export type PublicComplementGroup = {
  id: string;
  name: string;
  options: Array<{ id: string; name: string }>;
  required: boolean;
};

export type PublicMenuItem = {
  additionals: PublicAdditional[];
  complementGroups: PublicComplementGroup[];
  description: string;
  id: string;
  imageUrl: string | null;
  name: string;
  priceCents: number;
};

export type PublicMenuCategory = {
  id: string;
  items: PublicMenuItem[];
  name: string;
};

const STORAGE_KEY = "foode-cart-preview";

function formatPrice(priceCents: number) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

function itemForCalculation(item: PublicMenuItem): CatalogItemForCart {
  return {
    additionals: item.additionals.map((additional) => ({
      available: true,
      id: additional.id,
      priceCents: additional.priceCents,
    })),
    complementGroups: item.complementGroups.map((group) => ({
      id: group.id,
      options: group.options.map(({ id }) => ({ id })),
      required: group.required,
    })),
    id: item.id,
    priceCents: item.priceCents,
  };
}

function ItemCustomizer({
  item,
  onAdd,
}: {
  item: PublicMenuItem;
  onAdd: (line: CartLineContract) => boolean;
}) {
  const [additionalIds, setAdditionalIds] = useState<string[]>([]);
  const [complementSelections, setComplementSelections] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const calculationItem = useMemo(() => itemForCalculation(item), [item]);
  const draft = useMemo(
    () => ({ additionalIds, complementSelections, quantity }),
    [additionalIds, complementSelections, quantity],
  );
  const preview = previewLineTotalCents(calculationItem, draft);

  function toggleAdditional(additionalId: string) {
    setAdditionalIds((current) =>
      current.includes(additionalId)
        ? current.filter((id) => id !== additionalId)
        : [...current, additionalId],
    );
    setError(null);
  }

  function addItem() {
    const validation = validateCartLineChoices(calculationItem, draft);
    if (!validation.ok) {
      setError(
        validation.error === "missing_required_complement"
          ? "Escolha todos os Complementos obrigatórios."
          : "Revise as escolhas deste item.",
      );
      return;
    }

    const added = onAdd({
      additionalIds,
      complementSelections,
      itemId: item.id,
      quantity,
    });
    if (added) {
      setAdditionalIds([]);
      setComplementSelections({});
      setQuantity(1);
      setError(null);
    }
  }

  return (
    <OutlineContainer as="article" className="overflow-hidden p-0">
      {item.imageUrl ? (
        <img
          alt=""
          className="aspect-[16/10] w-full object-cover"
          src={item.imageUrl}
        />
      ) : null}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-[var(--color-ink)]">
            {item.name}
          </h3>
          <p className="shrink-0 font-bold text-[var(--color-primary-active)]">
            {formatPrice(item.priceCents)}
          </p>
        </div>
        {item.description ? (
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
            {item.description}
          </p>
        ) : null}

        {item.complementGroups.map((group) => (
          <fieldset
            className="mt-4 border-t border-[var(--color-hairline-soft)] pt-4"
            key={group.id}
          >
            <legend className="font-bold text-[var(--color-ink)]">
              {group.name}{" "}
              <span className="text-sm font-normal text-[var(--color-muted)]">
                {group.required ? "(obrigatório)" : "(opcional)"}
              </span>
            </legend>
            <div className="mt-2 grid gap-2">
              {!group.required ? (
                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--color-hairline)] px-3 text-sm text-[var(--color-body)]">
                  <input
                    checked={!complementSelections[group.id]}
                    name={`complement-${item.id}-${group.id}`}
                    onChange={() => {
                      setComplementSelections((current) => {
                        const next = { ...current };
                        delete next[group.id];
                        return next;
                      });
                      setError(null);
                    }}
                    type="radio"
                    value=""
                  />
                  Sem escolha
                </label>
              ) : null}
              {group.options.map((option) => (
                <label
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--color-hairline)] px-3 text-sm text-[var(--color-body)]"
                  key={option.id}
                >
                  <input
                    checked={complementSelections[group.id] === option.id}
                    name={`complement-${item.id}-${group.id}`}
                    onChange={() => {
                      setComplementSelections((current) => ({
                        ...current,
                        [group.id]: option.id,
                      }));
                      setError(null);
                    }}
                    type="radio"
                    value={option.id}
                  />
                  {option.name}
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        {item.additionals.length > 0 ? (
          <fieldset className="mt-4 border-t border-[var(--color-hairline-soft)] pt-4">
            <legend className="font-bold text-[var(--color-ink)]">
              Adicionais
            </legend>
            <div className="mt-2 grid gap-2">
              {item.additionals.map((additional) => (
                <label
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--color-hairline)] px-3 text-sm text-[var(--color-body)]"
                  key={additional.id}
                >
                  <span className="flex items-center gap-3">
                    <input
                      checked={additionalIds.includes(additional.id)}
                      onChange={() => toggleAdditional(additional.id)}
                      type="checkbox"
                    />
                    {additional.name}
                  </span>
                  <span className="font-bold">
                    + {formatPrice(additional.priceCents)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-hairline-soft)] pt-4">
          <label className="text-sm font-bold text-[var(--color-ink)]">
            Quantidade
            <input
              className="ml-3 min-h-11 w-20 rounded-xl border border-[var(--color-hairline)] px-3 outline-none focus:border-[var(--color-primary)]"
              inputMode="numeric"
              max={99}
              min={1}
              onChange={(event) => {
                setQuantity(Math.max(1, Math.min(99, Number(event.target.value))));
                setError(null);
              }}
              type="number"
              value={quantity}
            />
          </label>
          <p className="text-right text-sm text-[var(--color-muted)]">
            Prévia
            <strong className="block text-base text-[var(--color-ink)]">
              {preview === null ? "Complete as escolhas" : formatPrice(preview)}
            </strong>
          </p>
        </div>

        {error ? (
          <p className="mt-3 text-sm font-bold text-[var(--color-error)]" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="mt-4 min-h-12 w-full rounded-full bg-[var(--color-primary)] px-5 font-bold text-white active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          disabled={preview === null}
          onClick={addItem}
          type="button"
        >
          Adicionar ao carrinho
        </button>
      </div>
    </OutlineContainer>
  );
}

function checkoutErrorMessage(error: string | undefined) {
  switch (error) {
    case "invalid_phone":
      return "Informe um telefone celular válido com DDD.";
    case "billing_mode_not_allowed":
      return "PIX não está disponível para esta Loja.";
    case "pix_provider_error":
    case "pix_charge_unavailable":
    case "pix_provider_unavailable":
      return "Não foi possível gerar o PIX. Tente novamente em instantes.";
    case "store_paused":
      return "A Loja está em Pausa. Tente novamente mais tarde.";
    case "store_outside_hours":
      return "A Loja está fora do horário de funcionamento.";
    case "pickup_disabled":
      return "Retirada não está disponível nesta Loja.";
    case "delivery_not_configured":
      return "Delivery não está disponível nesta Loja.";
    case "neighborhood_not_served":
      return "Este bairro não é atendido no Delivery. Escolha Retirada se estiver disponível.";
    case "invalid_address":
      return "Informe endereço e bairro válidos para o Delivery.";
    case "idempotency_key_conflict":
      return "Esta tentativa conflitou com outro Pedido. Atualize e tente de novo.";
    case "item_unavailable":
    case "item_not_found":
    case "additional_unavailable":
    case "invalid_additional":
    case "invalid_complement_option":
    case "missing_required_complement":
    case "quantity_invalid":
    case "empty_cart":
      return "Revise o carrinho: algum item ou escolha ficou indisponível.";
    default:
      return "Não foi possível concluir o Pedido. Tente novamente.";
  }
}

export type PublicDeliveryConfig = {
  deliveryAvailable: boolean;
  fixedDeliveryFeeCents: number | null;
  mode: "fixed" | "neighborhood" | null;
  neighborhoods: Array<{ feeCents: number; name: string }>;
  pickupEnabled: boolean;
};

function GuestCheckoutForm({
  apiUrl,
  cart,
  checkoutAllowed,
  delivery,
  itemsTotalCents,
  onSuccess,
  storeSlug,
}: {
  apiUrl: string;
  cart: CartContract;
  checkoutAllowed: boolean;
  delivery: PublicDeliveryConfig;
  itemsTotalCents: number | null;
  onSuccess: () => void;
  storeSlug: string;
}) {
  const router = useRouter();
  const pickupEnabled = delivery.pickupEnabled;
  const deliveryAvailable = delivery.deliveryAvailable;
  const defaultFulfillment =
    deliveryAvailable ? "delivery" : pickupEnabled ? "pickup" : null;
  const [fulfillmentType, setFulfillmentType] = useState<
    "pickup" | "delivery" | null
  >(defaultFulfillment);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "on_delivery">(
    "pix",
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [streetLine, setStreetLine] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [complement, setComplement] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const attemptFingerprintRef = useRef<string | null>(null);

  const feePreview = useMemo(() => {
    if (fulfillmentType !== "delivery") return 0;
    if (delivery.mode === "fixed") return delivery.fixedDeliveryFeeCents ?? 0;
    if (delivery.mode === "neighborhood") {
      const key = neighborhood.trim().toLocaleLowerCase("pt-BR");
      const match = delivery.neighborhoods.find(
        (entry) =>
          entry.name.trim().toLocaleLowerCase("pt-BR") === key ||
          entry.name.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR") ===
            neighborhood
              .normalize("NFKD")
              .replace(/\p{M}/gu, "")
              .trim()
              .replace(/\s+/gu, " ")
              .toLocaleLowerCase("pt-BR"),
      );
      return match?.feeCents ?? null;
    }
    return null;
  }, [delivery, fulfillmentType, neighborhood]);

  if (!pickupEnabled && !deliveryAvailable) {
    return (
      <OutlineContainer className="mt-4 p-5">
        <h3 className="text-lg font-bold text-[var(--color-ink)]">Checkout</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
          Nenhum modo de Fulfillment está disponível nesta Loja no momento.
        </p>
      </OutlineContainer>
    );
  }

  if (!checkoutAllowed) {
    return (
      <OutlineContainer className="mt-4 p-5">
        <h3 className="text-lg font-bold text-[var(--color-ink)]">Checkout</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
          O checkout está bloqueado. A Loja precisa estar aberta e sem Pausa para
          concluir o Pedido.
        </p>
      </OutlineContainer>
    );
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fulfillmentType) {
      setError("Escolha Delivery ou Retirada.");
      return;
    }
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError("Informe nome e telefone para continuar.");
      return;
    }
    if (fulfillmentType === "delivery") {
      if (!streetLine.trim() || !neighborhood.trim()) {
        setError("Informe endereço e bairro para o Delivery.");
        return;
      }
      if (feePreview === null) {
        setError(
          pickupEnabled
            ? "Este bairro não é atendido. Você pode escolher Retirada."
            : "Este bairro não é atendido no Delivery.",
        );
        return;
      }
    }

    const address =
      fulfillmentType === "delivery"
        ? {
            complement: complement.trim() || null,
            neighborhood: neighborhood.trim(),
            reference: reference.trim() || null,
            streetLine: streetLine.trim(),
          }
        : null;

    const fingerprint = JSON.stringify({
      address,
      fulfillmentType,
      lines: cart.lines,
      name: trimmedName,
      paymentMethod,
      phone: trimmedPhone,
    });
    if (attemptFingerprintRef.current !== fingerprint) {
      idempotencyKeyRef.current = crypto.randomUUID();
      attemptFingerprintRef.current = fingerprint;
    }
    const idempotencyKey = idempotencyKeyRef.current;
    if (!idempotencyKey) {
      setError("Não foi possível iniciar o Pedido. Tente novamente.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        new URL(
          `/public/stores/${encodeURIComponent(storeSlug)}/orders`,
          apiUrl,
        ),
        {
          body: JSON.stringify({
            address,
            deliveryFeeCents: feePreview ?? undefined,
            fulfillmentType,
            guest: { name: trimmedName, phone: trimmedPhone },
            lines: cart.lines,
            paymentMethod,
            totalCents:
              itemsTotalCents != null && feePreview != null
                ? itemsTotalCents + feePreview
                : undefined,
          }),
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          method: "POST",
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        order?: { accessToken?: string };
      };
      if (!response.ok || !payload.order?.accessToken) {
        setError(checkoutErrorMessage(payload.error));
        return;
      }
      onSuccess();
      router.push(
        `/loja/${encodeURIComponent(storeSlug)}/pedido/${encodeURIComponent(payload.order.accessToken)}`,
      );
    } catch {
      setError("Não foi possível concluir o Pedido. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OutlineContainer className="mt-4 p-5">
      <h3 className="text-lg font-bold text-[var(--color-ink)]">
        Finalizar Pedido
      </h3>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Guest checkout — valores do navegador são só prévia.
      </p>

      <fieldset className="mt-4 grid gap-2">
        <legend className="text-sm font-bold text-[var(--color-ink)]">
          Modalidade
        </legend>
        {deliveryAvailable ? (
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--color-hairline)] px-3 text-sm">
            <input
              checked={fulfillmentType === "delivery"}
              name="fulfillment"
              onChange={() => {
                setFulfillmentType("delivery");
                setError(null);
              }}
              type="radio"
            />
            Delivery
          </label>
        ) : null}
        {pickupEnabled ? (
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--color-hairline)] px-3 text-sm">
            <input
              checked={fulfillmentType === "pickup"}
              name="fulfillment"
              onChange={() => {
                setFulfillmentType("pickup");
                setError(null);
              }}
              type="radio"
            />
            Retirada
          </label>
        ) : null}
      </fieldset>

      <fieldset className="mt-4 grid gap-2">
        <legend className="text-sm font-bold text-[var(--color-ink)]">
          Pagamento
        </legend>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--color-hairline)] px-3 text-sm">
          <input
            checked={paymentMethod === "pix"}
            name="payment"
            onChange={() => {
              setPaymentMethod("pix");
              setError(null);
            }}
            type="radio"
          />
          PIX
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--color-hairline)] px-3 text-sm">
          <input
            checked={paymentMethod === "on_delivery"}
            name="payment"
            onChange={() => {
              setPaymentMethod("on_delivery");
              setError(null);
            }}
            type="radio"
          />
          Pagamento na entrega
        </label>
      </fieldset>

      <dl className="mt-4 grid gap-2 text-sm">
        {fulfillmentType === "delivery" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-hairline)] px-3 py-3">
            <dt className="text-[var(--color-muted)]">Taxa (prévia)</dt>
            <dd className="font-bold text-[var(--color-ink)]">
              {feePreview === null
                ? "Informe um bairro atendido"
                : formatPrice(feePreview)}
            </dd>
          </div>
        ) : null}
        {itemsTotalCents != null && fulfillmentType === "delivery" && feePreview != null ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-hairline)] px-3 py-3">
            <dt className="text-[var(--color-muted)]">Total (prévia)</dt>
            <dd className="font-bold text-[var(--color-primary-active)]">
              {formatPrice(itemsTotalCents + feePreview)}
            </dd>
          </div>
        ) : null}
      </dl>

      <form className="mt-5 grid gap-4" onSubmit={submitCheckout}>
        <label className="block text-sm font-bold text-[var(--color-ink)]">
          Nome
          <input
            autoComplete="name"
            className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder="Seu nome"
            required
            value={name}
          />
        </label>
        <label className="block text-sm font-bold text-[var(--color-ink)]">
          Telefone
          <input
            autoComplete="tel"
            className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
            inputMode="tel"
            onChange={(event) => {
              setPhone(event.target.value);
              setError(null);
            }}
            placeholder="(11) 99999-9999"
            required
            value={phone}
          />
        </label>

        {fulfillmentType === "delivery" ? (
          <>
            <label className="block text-sm font-bold text-[var(--color-ink)]">
              Endereço (rua e número)
              <input
                autoComplete="street-address"
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                onChange={(event) => {
                  setStreetLine(event.target.value);
                  setError(null);
                }}
                placeholder="Rua Exemplo, 123"
                required
                value={streetLine}
              />
            </label>
            <label className="block text-sm font-bold text-[var(--color-ink)]">
              Bairro
              {delivery.mode === "neighborhood" && delivery.neighborhoods.length > 0 ? (
                <select
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                  onChange={(event) => {
                    setNeighborhood(event.target.value);
                    setError(null);
                  }}
                  required
                  value={neighborhood}
                >
                  <option value="">Selecione o bairro</option>
                  {delivery.neighborhoods.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name} · {formatPrice(entry.feeCents)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                  onChange={(event) => {
                    setNeighborhood(event.target.value);
                    setError(null);
                  }}
                  placeholder="Seu bairro"
                  required
                  value={neighborhood}
                />
              )}
            </label>
            <label className="block text-sm font-bold text-[var(--color-ink)]">
              Complemento (opcional)
              <input
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                onChange={(event) => setComplement(event.target.value)}
                placeholder="Apto, bloco…"
                value={complement}
              />
            </label>
            <label className="block text-sm font-bold text-[var(--color-ink)]">
              Referência (opcional)
              <input
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                onChange={(event) => setReference(event.target.value)}
                placeholder="Ponto de referência"
                value={reference}
              />
            </label>
          </>
        ) : null}

        {error ? (
          <p className="text-sm font-bold text-[var(--color-error)]" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="min-h-12 w-full rounded-full bg-[var(--color-primary)] px-5 font-bold text-white active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting || cart.lines.length === 0}
          type="submit"
        >
          {submitting ? "Enviando Pedido…" : "Confirmar Pedido"}
        </button>
      </form>
    </OutlineContainer>
  );
}

function CartPreview({
  apiUrl,
  cart,
  checkoutAllowed,
  delivery,
  itemsById,
  onClearCart,
  onRemove,
  onQuantityChange,
  storeSlug,
}: {
  apiUrl: string;
  cart: CartContract;
  checkoutAllowed: boolean;
  delivery: PublicDeliveryConfig;
  itemsById: Map<string, PublicMenuItem>;
  onClearCart: () => void;
  onQuantityChange: (lineIndex: number, quantity: number) => void;
  onRemove: (lineIndex: number) => void;
  storeSlug: string;
}) {
  const calculationItems = useMemo(
    () =>
      new Map(
        [...itemsById].map(([id, item]) => [id, itemForCalculation(item)]),
      ),
    [itemsById],
  );
  const total = previewCartTotalCents(calculationItems, cart);

  return (
    <aside aria-labelledby="cart-title" className="mt-8">
      <OutlineContainer className="p-5">
        <h2 className="text-xl font-bold text-[var(--color-ink)]" id="cart-title">
          Carrinho
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Prévia desta Loja. Os preços serão recalculados pelo servidor ao criar o
          Pedido.
        </p>
        {cart.lines.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            Seu carrinho está vazio.
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {cart.lines.map((line, lineIndex) => {
              const item = itemsById.get(line.itemId);
              if (!item) return null;
              const selectedAdditionals = item.additionals.filter((additional) =>
                line.additionalIds.includes(additional.id),
              );
              const selectedComplements = item.complementGroups.flatMap((group) => {
                const optionId = line.complementSelections[group.id];
                const option = group.options.find(({ id }) => id === optionId);
                return option ? [`${group.name}: ${option.name}`] : [];
              });
              const lineTotal = previewLineTotalCents(
                itemForCalculation(item),
                line,
              );

              return (
                <div
                  className="border-t border-[var(--color-hairline-soft)] pt-4"
                  key={`${line.itemId}-${lineIndex}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-[var(--color-ink)]">
                        {item.name}
                      </h3>
                      {[...selectedComplements, ...selectedAdditionals.map(({ name }) => name)]
                        .map((choice) => (
                          <p
                            className="mt-1 text-sm text-[var(--color-muted)]"
                            key={choice}
                          >
                            {choice}
                          </p>
                        ))}
                    </div>
                    <strong className="shrink-0 text-[var(--color-primary-active)]">
                      {lineTotal === null ? "Indisponível" : formatPrice(lineTotal)}
                    </strong>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <label className="text-sm font-bold text-[var(--color-ink)]">
                      Quantidade
                      <input
                        className="ml-3 min-h-10 w-20 rounded-xl border border-[var(--color-hairline)] px-3 outline-none focus:border-[var(--color-primary)]"
                        max={99}
                        min={1}
                        onChange={(event) =>
                          onQuantityChange(
                            lineIndex,
                            Math.max(
                              1,
                              Math.min(99, Number(event.target.value)),
                            ),
                          )
                        }
                        type="number"
                        value={line.quantity}
                      />
                    </label>
                    <button
                      className="min-h-10 rounded-full border border-[var(--color-hairline)] px-4 text-sm font-bold text-[var(--color-body)] active:translate-y-px"
                      onClick={() => onRemove(lineIndex)}
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t border-[var(--color-hairline)] pt-4 text-lg font-bold text-[var(--color-ink)]">
              <span>Total da prévia</span>
              <span>{total === null ? "Revisar carrinho" : formatPrice(total)}</span>
            </div>
          </div>
        )}
      </OutlineContainer>
      {cart.lines.length > 0 ? (
        <GuestCheckoutForm
          apiUrl={apiUrl}
          cart={cart}
          checkoutAllowed={checkoutAllowed}
          delivery={delivery}
          itemsTotalCents={total}
          onSuccess={onClearCart}
          storeSlug={storeSlug}
        />
      ) : null}
    </aside>
  );
}

export function StorefrontCatalog({
  apiUrl,
  categories,
  checkoutAllowed,
  delivery,
  storeSlug,
}: {
  apiUrl: string;
  categories: PublicMenuCategory[];
  checkoutAllowed: boolean;
  delivery: PublicDeliveryConfig;
  storeSlug: string;
}) {
  const [cart, setCart] = useState<CartContract>(() => createEmptyCart(storeSlug));
  const [cartError, setCartError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const itemsById = useMemo(
    () =>
      new Map(
        categories.flatMap((category) =>
          category.items.map((item) => [item.id, item] as const),
        ),
      ),
    [categories],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = cartContractSchema.safeParse(JSON.parse(stored));
        if (parsed.success) setCart(parsed.data);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  function addLine(line: CartLineContract) {
    const singleStore = assertSingleStoreCart(cart, storeSlug);
    if (!singleStore.ok) {
      setCartError(
        "O carrinho já pertence a outra Loja. Remova os itens antes de trocar de Loja.",
      );
      return false;
    }
    setCart((current) => ({
      lines: [...current.lines, line],
      storeSlug,
    }));
    setCartError(null);
    return true;
  }

  function changeQuantity(lineIndex: number, quantity: number) {
    setCart((current) => ({
      ...current,
      lines: current.lines.map((line, index) =>
        index === lineIndex ? { ...line, quantity } : line,
      ),
    }));
  }

  function removeLine(lineIndex: number) {
    setCart((current) => ({
      ...current,
      lines: current.lines.filter((_, index) => index !== lineIndex),
    }));
    setCartError(null);
  }

  const belongsToAnotherStore =
    cart.lines.length > 0 && cart.storeSlug !== storeSlug;

  return (
    <>
      <div className="grid gap-8">
        {categories.map((category) => (
          <section
            aria-labelledby={`category-${category.id}`}
            key={category.id}
          >
            <h2
              className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]"
              id={`category-${category.id}`}
            >
              {category.name}
            </h2>
            <div className="mt-4 grid gap-4">
              {category.items.map((item) => (
                <ItemCustomizer item={item} key={item.id} onAdd={addLine} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {cartError || belongsToAnotherStore ? (
        <div
          className="mt-6 rounded-xl border border-[var(--color-error)] px-4 py-3 text-sm font-bold text-[var(--color-error)]"
          role="alert"
        >
          <p>
            {cartError ??
              "O carrinho pertence a outra Loja e não pode ser usado neste Cardápio."}
          </p>
          {belongsToAnotherStore ? (
            <button
              className="mt-3 block min-h-10 rounded-full border border-[var(--color-error)] px-4"
              onClick={() => {
                setCart(createEmptyCart(storeSlug));
                setCartError(null);
              }}
              type="button"
            >
              Esvaziar carrinho anterior
            </button>
          ) : null}
        </div>
      ) : null}
      {belongsToAnotherStore ? null : (
        <CartPreview
          apiUrl={apiUrl}
          cart={cart}
          checkoutAllowed={checkoutAllowed}
          delivery={delivery}
          itemsById={itemsById}
          onClearCart={() => {
            setCart(createEmptyCart(storeSlug));
            setCartError(null);
          }}
          onQuantityChange={changeQuantity}
          onRemove={removeLine}
          storeSlug={storeSlug}
        />
      )}
    </>
  );
}
