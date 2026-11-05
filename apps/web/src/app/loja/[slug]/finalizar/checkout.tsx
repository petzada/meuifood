"use client";

// Checkout numa tela só (X1–X9, Ticket 24a): Seus dados (busca pelo telefone mascarada +
// "Sou eu", lembrar no aparelho) → Como receber → Endereço (CEP opcional, bairro da lista com
// a taxa, "Sem número") → Pagamento (meios neutros; troco inline; bandeiras) → Observações →
// Resumo com totais do servidor → aviso de Privacidade, selo "Ambiente seguro" e CTA fixo que
// diz o que falta (G1/G2). Envio idempotente (X7): a mesma chave em todo retry.
import type { PublicMenu } from "@foode/shared/menu";
import { formatBRL } from "@foode/shared/money";
import {
  CARD_BRAND_LABELS,
  ORDER_NOTE_MAX,
  PAYMENT_METHODS,
  checkoutErrorMessagePt,
  formatEtaPt,
  paymentMethodLabelPt,
  type CheckoutQuoteResponse,
  type Fulfillment,
  type PaymentMethod,
  type PhoneLookupResponse,
  type StorefrontStoreState,
} from "@foode/shared/order";
import {
  Button,
  Checkbox,
  Field,
  Input,
  OutlineContainer,
  Radio,
  Select,
  Textarea,
} from "@foode/ui";
import { ArrowLeft, ShieldCheck, SpinnerGap } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Turnstile, type TurnstileHandle } from "../../../../components/turnstile";
import { summarizeCart } from "../storefront/cart-store";
import { blockedCheckoutMessage, describeAvailability } from "../storefront/store-status";
import { useStoreCart } from "../storefront/use-store-cart";
import { lookupCep } from "./cep";
import { createCheckoutApi, type CheckoutApi } from "./checkout-api";
import {
  applyAddress,
  availableFulfillments,
  buildCartBody,
  buildCreateRequest,
  checkoutCtaLabel,
  createCheckoutForm,
  forgetRememberedCustomer,
  formatPhoneBr,
  formatPostalCode,
  localTotals,
  matchNeighborhoodId,
  postalCodeDigits,
  readRememberedCustomer,
  rememberedFromForm,
  validateCheckout,
  writeRememberedCustomer,
  type CheckoutField,
  type CheckoutForm,
  type RememberedCustomer,
} from "./checkout-state";

export type CheckoutProps = {
  /** Injetável nos testes; por padrão fala com `/loja/{slug}/finalizar/*`. */
  api?: CheckoutApi;
  cepLookup?: typeof lookupCep;
  menu: PublicMenu;
  now?: number;
  /** Site key pública do Turnstile; vazia = busca por telefone indisponível. */
  siteKey: string;
  state: StorefrontStoreState;
};

export function fieldId(field: CheckoutField): string {
  return `checkout-${field}`;
}

const QUOTE_DEBOUNCE_MS = 300;

type LookupState =
  | { status: "idle" }
  | { status: "searching" }
  | {
      status: "found";
      masked: Extract<PhoneLookupResponse, { found: true }>["masked"];
      confirmToken: string;
    }
  | { status: "confirming"; masked: Extract<PhoneLookupResponse, { found: true }>["masked"] }
  | { status: "done" }
  | { status: "unavailable"; message: string };

function Section({
  children,
  description,
  step,
  title,
}: {
  children: ReactNode;
  description?: string;
  step: number;
  title: string;
}) {
  const id = `checkout-section-${step}`;
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-ink)]" id={id}>
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full border border-[var(--color-hairline)] text-sm text-[var(--color-primary-strong)]"
          >
            {step}
          </span>
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function methodDescription(method: PaymentMethod, available: boolean): string {
  if (!available) return "Indisponível no momento";
  switch (method) {
    case "pix":
      return "Pague pelo app do seu banco";
    case "credit":
      return "Cartão de crédito online";
    case "on_delivery":
      return "Dinheiro ou maquininha ao receber";
  }
}

export function Checkout({
  api: apiProp,
  cepLookup = lookupCep,
  menu,
  now,
  siteKey,
  state,
}: CheckoutProps) {
  const router = useRouter();
  const api = useMemo(() => apiProp ?? createCheckoutApi(), [apiProp]);
  const { cart, dispatch, hydrated } = useStoreCart(menu.slug);
  const itemsById = useMemo(
    () => new Map(menu.categories.flatMap((c) => c.items.map((i) => [i.id, i] as const))),
    [menu],
  );
  const summary = useMemo(() => summarizeCart(itemsById, cart), [itemsById, cart]);
  const availability = useMemo(() => describeAvailability(state.availability, now), [now, state]);
  const closedMessage = blockedCheckoutMessage(availability);

  const [form, setForm] = useState<CheckoutForm>(() => createCheckoutForm(state));
  const [remembered, setRemembered] = useState<RememberedCustomer | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<CheckoutField>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuoteResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [cepStatus, setCepStatus] = useState<"idle" | "searching">("idle");
  const turnstile = useRef<TurnstileHandle>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const lookedUpPhone = useRef<string | null>(null);
  /** Última versão do formulário para a cotação (rua/número não disparam nova cotação). */
  const formRef = useRef(form);
  formRef.current = form;

  // Dados lembrados no aparelho (P-2.2), só depois da hidratação.
  useEffect(() => {
    const stored = readRememberedCustomer(window.localStorage, menu.slug);
    if (!stored) return;
    setRemembered(stored);
    setForm(createCheckoutForm(state, stored));
    setLookup({ status: "done" });
  }, [menu.slug, state]);

  const update = useCallback(<K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
  }, []);
  const updateAddress = useCallback((patch: Partial<CheckoutForm["address"]>) => {
    setForm((current) => ({ ...current, address: { ...current.address, ...patch } }));
    setSubmitError(null);
  }, []);
  const touch = useCallback((field: CheckoutField) => {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)));
  }, []);

  // Cotação no servidor (G7) a cada mudança de Fulfillment/bairro/linhas, com debounce.
  const { lines } = cart;
  const { fulfillment } = form;
  const { neighborhoodId, neighborhoodName } = form.address;
  const quoteReady =
    hydrated &&
    lines.length > 0 &&
    !summary.hasInvalidLines &&
    fulfillment !== null &&
    (fulfillment === "pickup" ||
      (state.delivery?.mode === "neighborhood"
        ? neighborhoodId !== ""
        : neighborhoodName.trim() !== ""));
  useEffect(() => {
    if (!quoteReady) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      // O contrato exige rua e número; a cotação só depende de Fulfillment, bairro e linhas.
      const { address } = formRef.current;
      const body = buildCartBody(
        {
          address: { ...address, number: address.number || "0", street: address.street || "-" },
          fulfillment,
        },
        lines,
        state,
      );
      void api.quote(menu.slug, body).then((result) => {
        if (!cancelled) setQuote(result);
      });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, fulfillment, lines, menu.slug, neighborhoodId, neighborhoodName, quoteReady, state]);

  const totals = quote?.ok ? quote : localTotals(state, form, summary.subtotalCents);
  const paymentMethods = quote?.ok ? quote.paymentMethods : state.paymentMethods;
  const eta = quote?.ok ? quote.eta : fulfillment ? (state[fulfillment]?.eta ?? null) : null;
  const validation = validateCheckout(form, {
    state: { ...state, paymentMethods },
    subtotalCents: totals.subtotalCents,
    totalCents: totals.totalCents,
  });
  const serverMinimum =
    quote && !quote.ok && quote.error.code === "below_minimum" ? quote.error : null;
  const minimum = serverMinimum ?? validation.minimum;
  const belowMinimum = minimum !== null && minimum.missingCents > 0;
  const canSubmit = validation.ok && !belowMinimum && !closedMessage && !submitting;
  const errorFor = (field: CheckoutField) =>
    showAll || touched.has(field) ? validation.errors[field] : undefined;
  /** `error` só quando existe (exactOptionalPropertyTypes). */
  const errorProps = (field: CheckoutField): { error?: string } => {
    const error = errorFor(field);
    return error ? { error } : {};
  };

  const fulfillments = availableFulfillments(state);
  const { delivery } = state;

  // ---- Busca pelo telefone (P-2.1): mascarada, só depois do Turnstile; "Sou eu" preenche.
  const phoneDigits = form.phone.replace(/\D/gu, "");
  const phoneValid = !validation.errors.phone && phoneDigits.length > 0;
  const lookupEnabled = !remembered && siteKey !== "" && lookup.status !== "done";

  async function runLookup() {
    if (!lookupEnabled || !phoneValid || !turnstileToken) return;
    if (lookedUpPhone.current === phoneDigits) return;
    lookedUpPhone.current = phoneDigits;
    setLookup({ status: "searching" });
    const result = await api.lookupPhone(menu.slug, { phone: form.phone, turnstileToken });
    setTurnstileToken(null);
    turnstile.current?.reset();
    if (!result) {
      setLookup({ status: "idle" });
      return;
    }
    if (!result.found) {
      if ("reason" in result && result.reason === "rate_limited") {
        setLookup({
          status: "unavailable",
          message: "Muitas consultas por agora. Preencha seus dados.",
        });
      } else {
        setLookup({ status: "done" });
      }
      return;
    }
    setLookup({ confirmToken: result.confirmToken, masked: result.masked, status: "found" });
  }

  async function confirmLookup() {
    if (lookup.status !== "found") return;
    setLookup({ masked: lookup.masked, status: "confirming" });
    const result = await api.confirmPhone(menu.slug, lookup.confirmToken);
    if (!result?.found) {
      setLookup({ status: "done" });
      return;
    }
    setForm((current) => ({
      ...current,
      address: result.address
        ? applyAddress(current.address, result.address, state)
        : current.address,
      name: result.customer.name,
      phone: formatPhoneBr(result.customer.phone),
    }));
    setLookup({ status: "done" });
  }

  function forget() {
    forgetRememberedCustomer(window.localStorage, menu.slug);
    setRemembered(null);
    setForm(createCheckoutForm(state));
    setLookup({ status: "idle" });
    lookedUpPhone.current = null;
  }

  // ---- CEP (P-3.1): preenche rua e, se o nome bater, o bairro; falha silenciosa.
  async function handleCepBlur() {
    touch("postalCode");
    const digits = postalCodeDigits(form.address.postalCode);
    if (!digits) return;
    setCepStatus("searching");
    const result = await cepLookup(digits);
    setCepStatus("idle");
    if (!result) return;
    setForm((current) => ({
      ...current,
      address: {
        ...current.address,
        neighborhoodId:
          matchNeighborhoodId(state, result.neighborhood) ?? current.address.neighborhoodId,
        neighborhoodName:
          state.delivery?.mode === "fixed" &&
          result.neighborhood &&
          !current.address.neighborhoodName
            ? result.neighborhood
            : current.address.neighborhoodName,
        street: result.street ?? current.address.street,
      },
    }));
  }

  // ---- Envio (X7).
  function focusField(field: CheckoutField) {
    const element = document.getElementById(fieldId(field));
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus();
  }

  async function handleSubmit() {
    if (submitting) return;
    if (closedMessage) {
      setSubmitError(closedMessage);
      alertRef.current?.focus();
      return;
    }
    if (!validation.ok || belowMinimum) {
      setShowAll(true);
      if (validation.firstError) focusField(validation.firstError);
      setSubmitError(
        belowMinimum && minimum
          ? `Faltam ${formatBRL(minimum.missingCents)} para o pedido mínimo de ${formatBRL(minimum.minimumCents)}.`
          : "Confira os campos destacados.",
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const body = buildCreateRequest(form, lines, state, idempotencyKey);
    const result = await api.createOrder(menu.slug, body);
    setSubmitting(false);
    if (!result) {
      setSubmitError("Não conseguimos enviar seu pedido agora. Tente de novo em instantes.");
      alertRef.current?.focus();
      return;
    }
    if (!result.ok) {
      setSubmitError(checkoutErrorMessagePt(result.error));
      if (result.error.code === "idempotency_conflict") setIdempotencyKey(crypto.randomUUID());
      alertRef.current?.focus();
      return;
    }
    if (form.remember) {
      const customer = rememberedFromForm(form, state);
      if (customer) writeRememberedCustomer(window.localStorage, menu.slug, customer);
    } else {
      forgetRememberedCustomer(window.localStorage, menu.slug);
    }
    dispatch({ type: "clear" });
    router.push(result.trackingPath);
  }

  const ctaLabel = closedMessage
    ? "Pedidos indisponíveis agora"
    : checkoutCtaLabel(
        { errors: validation.errors, firstError: validation.firstError, minimum },
        totals.totalCents,
        submitting,
      );

  const menuHref = `/loja/${encodeURIComponent(menu.slug)}`;

  if (hydrated && lines.length === 0) {
    return (
      <main className="min-h-dvh bg-[var(--color-canvas)]">
        <CheckoutHeader menuHref={menuHref} name={menu.name} />
        <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
          <div className="foode-outline grid gap-4 p-6 text-center">
            <p className="text-[var(--color-body)]">Seu carrinho está vazio.</p>
            <Button className="justify-self-center" href={menuHref} variant="secondary">
              Ver Cardápio
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)] pb-40">
      <CheckoutHeader menuHref={menuHref} name={menu.name} />

      <form
        className="mx-auto grid max-w-3xl gap-8 px-4 pt-6 md:px-8"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {closedMessage ? (
          <p className="foode-outline p-4 text-sm font-bold text-[var(--color-ink)]" role="status">
            {closedMessage}
          </p>
        ) : null}

        {/* 1 · Seus dados */}
        <Section
          description="Usamos só para preparar e entregar este pedido."
          step={1}
          title="Seus dados"
        >
          {remembered ? (
            <p className="text-sm text-[var(--color-body)]">
              Dados lembrados neste aparelho.{" "}
              <button
                className="font-bold text-[var(--color-primary-strong)] underline-offset-2 hover:underline"
                onClick={forget}
                type="button"
              >
                Esquecer meus dados
              </button>
            </p>
          ) : null}
          <Field {...errorProps("phone")} id={fieldId("phone")} label="WhatsApp">
            {(a11y) => (
              <Input
                {...a11y}
                autoComplete="tel-national"
                inputMode="tel"
                name="phone"
                onBlur={() => {
                  touch("phone");
                  void runLookup();
                }}
                onChange={(event) => update("phone", formatPhoneBr(event.target.value))}
                placeholder="(11) 91234-5678"
                type="tel"
                value={form.phone}
              />
            )}
          </Field>

          {lookupEnabled && phoneValid && lookup.status === "idle" ? (
            <div className="grid gap-2">
              <p className="text-sm text-[var(--color-muted)]">
                Já pediu aqui antes? Confirme que você não é um robô para buscar seus dados.
              </p>
              <Turnstile
                onToken={(token) => {
                  setTurnstileToken(token);
                }}
                ref={turnstile}
                siteKey={siteKey}
              />
              {turnstileToken ? (
                <Button
                  className="justify-self-start"
                  onClick={() => void runLookup()}
                  variant="secondary"
                >
                  Buscar meus dados
                </Button>
              ) : null}
            </div>
          ) : null}
          {lookup.status === "searching" ? (
            <p className="text-sm text-[var(--color-muted)]" role="status">
              Buscando pedidos anteriores…
            </p>
          ) : null}
          {lookup.status === "found" || lookup.status === "confirming" ? (
            <div
              className="foode-outline grid gap-3 p-4"
              role="group"
              aria-label="Pedido anterior encontrado"
            >
              <p className="text-[var(--color-body)]">
                Encontramos um pedido anterior de{" "}
                <strong className="text-[var(--color-ink)]">{lookup.masked.firstName}</strong>
                {lookup.masked.street ? (
                  <>
                    {" "}
                    em <strong className="text-[var(--color-ink)]">{lookup.masked.street}</strong>
                    {lookup.masked.neighborhood ? `, ${lookup.masked.neighborhood}` : ""}
                  </>
                ) : null}
                . É você?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  aria-busy={lookup.status === "confirming" ? true : undefined}
                  disabled={lookup.status === "confirming"}
                  onClick={() => void confirmLookup()}
                >
                  Sou eu
                </Button>
                <Button onClick={() => setLookup({ status: "done" })} variant="secondary">
                  Não sou eu
                </Button>
              </div>
            </div>
          ) : null}
          {lookup.status === "unavailable" ? (
            <p className="text-sm text-[var(--color-muted)]" role="status">
              {lookup.message}
            </p>
          ) : null}

          <Field {...errorProps("name")} id={fieldId("name")} label="Nome e sobrenome">
            {(a11y) => (
              <Input
                {...a11y}
                autoComplete="name"
                name="name"
                onBlur={() => touch("name")}
                onChange={(event) => update("name", event.target.value)}
                value={form.name}
              />
            )}
          </Field>
          <Checkbox
            checked={form.remember}
            name="remember"
            onChange={(event) => update("remember", event.target.checked)}
          >
            Lembrar meus dados neste aparelho
          </Checkbox>
        </Section>

        {/* 2 · Como receber */}
        <Section step={2} title="Como receber">
          {fulfillments.length === 0 ? (
            <p className="text-[var(--color-body)]" role="alert">
              A Loja não está recebendo pedidos agora.
            </p>
          ) : fulfillments.length === 1 ? (
            <p className="text-[var(--color-body)]" id={fieldId("fulfillment")}>
              <span className="font-bold text-[var(--color-ink)]">
                {fulfillments[0] === "delivery" ? "Delivery" : "Retirada na Loja"}
              </span>
              {eta ? ` · ${formatEtaPt(eta)}` : null}
            </p>
          ) : (
            <fieldset
              aria-describedby={
                errorFor("fulfillment") ? `${fieldId("fulfillment")}-error` : undefined
              }
              className="grid gap-2"
              id={fieldId("fulfillment")}
              tabIndex={-1}
            >
              <legend className="sr-only">Como receber</legend>
              {fulfillments.map((option) => (
                <FulfillmentOption
                  checked={fulfillment === option}
                  key={option}
                  onChange={() => update("fulfillment", option)}
                  option={option}
                  state={state}
                />
              ))}
              {errorFor("fulfillment") ? (
                <p
                  className="foode-field__error"
                  id={`${fieldId("fulfillment")}-error`}
                  role="alert"
                >
                  {errorFor("fulfillment")}
                </p>
              ) : null}
            </fieldset>
          )}
        </Section>

        {/* 3 · Endereço (Delivery) */}
        {fulfillment === "delivery" && delivery ? (
          <Section step={3} title="Endereço de entrega">
            <Field
              {...errorProps("postalCode")}
              hint={
                cepStatus === "searching"
                  ? "Buscando endereço…"
                  : "Opcional: preenche a rua e o bairro."
              }
              id={fieldId("postalCode")}
              label="CEP"
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  autoComplete="postal-code"
                  inputMode="numeric"
                  name="postalCode"
                  onBlur={() => void handleCepBlur()}
                  onChange={(event) =>
                    updateAddress({ postalCode: formatPostalCode(event.target.value) })
                  }
                  placeholder="00000-000"
                  value={form.address.postalCode}
                />
              )}
            </Field>
            <Field {...errorProps("street")} id={fieldId("street")} label="Rua">
              {(a11y) => (
                <Input
                  {...a11y}
                  autoComplete="address-line1"
                  name="street"
                  onBlur={() => touch("street")}
                  onChange={(event) => updateAddress({ street: event.target.value })}
                  value={form.address.street}
                />
              )}
            </Field>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field {...errorProps("number")} id={fieldId("number")} label="Número">
                {(a11y) => (
                  <Input
                    {...a11y}
                    disabled={form.address.noNumber}
                    inputMode="numeric"
                    name="number"
                    onBlur={() => touch("number")}
                    onChange={(event) => updateAddress({ number: event.target.value })}
                    value={form.address.noNumber ? "S/N" : form.address.number}
                  />
                )}
              </Field>
              <Checkbox
                checked={form.address.noNumber}
                name="noNumber"
                onChange={(event) => updateAddress({ noNumber: event.target.checked })}
              >
                Sem número
              </Checkbox>
            </div>
            {delivery.mode === "neighborhood" ? (
              <Field
                {...errorProps("neighborhoodId")}
                hint="Entregamos só nos bairros da lista."
                id={fieldId("neighborhoodId")}
                label="Bairro"
              >
                {(a11y) => (
                  <Select
                    {...a11y}
                    name="neighborhoodId"
                    onBlur={() => touch("neighborhoodId")}
                    onChange={(event) => updateAddress({ neighborhoodId: event.target.value })}
                    value={form.address.neighborhoodId}
                  >
                    <option value="">Escolha o bairro</option>
                    {delivery.neighborhoods.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} · {formatBRL(n.feeCents)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <Field
                {...errorProps("neighborhoodName")}
                hint={`Taxa fixa de ${formatBRL(delivery.feeCents)}.`}
                id={fieldId("neighborhoodName")}
                label="Bairro"
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    autoComplete="address-level3"
                    name="neighborhoodName"
                    onBlur={() => touch("neighborhoodName")}
                    onChange={(event) => updateAddress({ neighborhoodName: event.target.value })}
                    value={form.address.neighborhoodName}
                  />
                )}
              </Field>
            )}
            {delivery.mode === "neighborhood" && state.pickup ? (
              <p className="text-sm text-[var(--color-muted)]">
                Seu bairro não está na lista? Ainda não entregamos aí.{" "}
                <button
                  className="font-bold text-[var(--color-primary-strong)] underline-offset-2 hover:underline"
                  onClick={() => update("fulfillment", "pickup")}
                  type="button"
                >
                  Retirar na Loja
                </button>
              </p>
            ) : null}
            <Field {...errorProps("complement")} id={fieldId("complement")} label="Complemento">
              {(a11y) => (
                <Input
                  {...a11y}
                  autoComplete="address-line2"
                  name="complement"
                  onChange={(event) => updateAddress({ complement: event.target.value })}
                  placeholder="Casa, apto, bloco…"
                  value={form.address.complement}
                />
              )}
            </Field>
            <Field
              {...errorProps("reference")}
              id={fieldId("reference")}
              label="Ponto de referência"
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  name="reference"
                  onChange={(event) => updateAddress({ reference: event.target.value })}
                  placeholder="Ex.: ao lado da padaria"
                  value={form.address.reference}
                />
              )}
            </Field>
          </Section>
        ) : null}

        {/* 4 · Pagamento */}
        <Section step={fulfillment === "delivery" ? 4 : 3} title="Pagamento">
          <fieldset
            aria-describedby={errorFor("payment") ? `${fieldId("payment")}-error` : undefined}
            className="grid gap-2"
            id={fieldId("payment")}
            tabIndex={-1}
          >
            <legend className="sr-only">Como pagar</legend>
            {PAYMENT_METHODS.map((method) => {
              const available = paymentMethods.includes(method);
              return (
                <Radio
                  checked={form.payment === method}
                  className="foode-outline px-4 py-3"
                  disabled={!available}
                  key={method}
                  name="payment"
                  onChange={() => update("payment", method)}
                  value={method}
                >
                  <span className="block font-bold text-[var(--color-ink)]">
                    {paymentMethodLabelPt(method)}
                  </span>
                  <span className="block text-sm text-[var(--color-muted)]">
                    {methodDescription(method, available)}
                  </span>
                </Radio>
              );
            })}
            {errorFor("payment") ? (
              <p className="foode-field__error" id={`${fieldId("payment")}-error`} role="alert">
                {errorFor("payment")}
              </p>
            ) : null}
          </fieldset>
          {form.payment === "on_delivery" ? (
            <div className="grid gap-3">
              <BrandLines brands={state.cardBrands} />
              <Field
                {...errorProps("changeFor")}
                hint="Opcional. Deixe em branco se não precisa de troco."
                id={fieldId("changeFor")}
                label="Troco para"
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    inputMode="decimal"
                    name="changeFor"
                    onBlur={() => touch("changeFor")}
                    onChange={(event) => update("changeFor", event.target.value)}
                    placeholder={`Ex.: ${formatBRL(Math.ceil(totals.totalCents / 5000) * 5000 || 5000)}`}
                    value={form.changeFor}
                  />
                )}
              </Field>
            </div>
          ) : null}
        </Section>

        {/* 5 · Observações */}
        <Section step={fulfillment === "delivery" ? 5 : 4} title="Observações">
          <Field
            {...errorProps("note")}
            hint={`${form.note.length}/${ORDER_NOTE_MAX}`}
            id={fieldId("note")}
            label="Alguma observação para a Loja?"
          >
            {(a11y) => (
              <Textarea
                {...a11y}
                maxLength={ORDER_NOTE_MAX}
                name="note"
                onChange={(event) => update("note", event.target.value)}
                placeholder="Ex.: apertar a campainha"
                rows={3}
                value={form.note}
              />
            )}
          </Field>
        </Section>

        {/* 6 · Resumo */}
        <Section step={fulfillment === "delivery" ? 6 : 5} title="Resumo">
          <OutlineContainer className="grid gap-3 p-4">
            <ul className="grid gap-2" role="list">
              {summary.lines.map((view) => (
                <li
                  className="flex justify-between gap-3 text-sm"
                  key={`${view.line.itemId}-${view.lineIndex}`}
                >
                  <span className="text-[var(--color-body)]">
                    <span className="tabular-nums">{view.line.quantity}×</span>{" "}
                    {view.item?.name ?? "Item fora do Cardápio"}
                  </span>
                  {view.subtotalCents !== null ? (
                    <span className="shrink-0 tabular-nums text-[var(--color-ink)]">
                      {formatBRL(view.subtotalCents)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <a className="text-sm font-bold text-[var(--color-primary-strong)]" href={menuHref}>
              Alterar itens
            </a>
            <dl className="grid gap-1 border-t border-[var(--color-hairline-soft)] pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-body)]">Subtotal</dt>
                <dd className="m-0 tabular-nums">{formatBRL(totals.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-body)]">
                  {fulfillment === "pickup" ? "Retirada" : "Taxa de entrega"}
                </dt>
                <dd className="m-0 tabular-nums">
                  {fulfillment === "pickup" ? "grátis" : formatBRL(totals.deliveryFeeCents)}
                </dd>
              </div>
              {totals.discountCents > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-body)]">Desconto</dt>
                  <dd className="m-0 tabular-nums">−{formatBRL(totals.discountCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-bold text-[var(--color-ink)]">
                <dt>Total</dt>
                <dd aria-live="polite" className="m-0 tabular-nums">
                  {formatBRL(totals.totalCents)}
                </dd>
              </div>
            </dl>
            {eta ? (
              <p className="text-sm text-[var(--color-muted)]">
                Previsão: {formatEtaPt(eta)}{" "}
                {fulfillment === "pickup" ? "para retirar" : "para entregar"}
              </p>
            ) : null}
            {belowMinimum && minimum ? (
              <p className="text-sm font-bold text-[var(--color-ink)]" role="status">
                Faltam {formatBRL(minimum.missingCents)} para o pedido mínimo de{" "}
                {formatBRL(minimum.minimumCents)}.
              </p>
            ) : null}
          </OutlineContainer>

          <div className="grid gap-3">
            <p className="text-sm text-[var(--color-ink)]">
              Ao fazer o pedido, você concorda com a{" "}
              <a className="font-bold underline" href="/privacidade" rel="noopener" target="_blank">
                Política de Privacidade
              </a>
              . Seus dados servem só para preparar e entregar este pedido.
            </p>
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-ink)]">
              <ShieldCheck
                aria-hidden
                className="text-[var(--color-primary)]"
                size={18}
                weight="bold"
              />
              Ambiente seguro
            </p>
          </div>
        </Section>

        <div className="foode-cart-bar">
          <div className="mx-auto grid max-w-3xl gap-2">
            <p
              aria-live="assertive"
              className={["text-sm font-bold text-[var(--color-error)]", !submitError && "sr-only"]
                .filter(Boolean)
                .join(" ")}
              ref={alertRef}
              role="alert"
              tabIndex={-1}
            >
              {submitError}
            </p>
            <Button
              aria-busy={submitting ? true : undefined}
              aria-disabled={canSubmit ? undefined : "true"}
              className={["w-full", !canSubmit && !submitting && "foode-button--pending"]
                .filter(Boolean)
                .join(" ")}
              type="submit"
            >
              <span className="inline-flex items-center justify-center gap-2">
                {submitting ? (
                  <SpinnerGap aria-hidden className="animate-spin" size={20} weight="bold" />
                ) : null}
                {ctaLabel}
              </span>
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}

function CheckoutHeader({ menuHref, name }: { menuHref: string; name: string }) {
  return (
    <header className="border-b border-[var(--color-hairline)]">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-3 md:px-6">
        <a aria-label="Voltar ao Cardápio" className="foode-icon-button" href={menuHref}>
          <ArrowLeft aria-hidden size={20} weight="bold" />
        </a>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            {name}
          </p>
          <h1 className="truncate text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
            Finalizar pedido
          </h1>
        </div>
      </div>
    </header>
  );
}

function FulfillmentOption({
  checked,
  onChange,
  option,
  state,
}: {
  checked: boolean;
  onChange: () => void;
  option: Fulfillment;
  state: StorefrontStoreState;
}) {
  const details: string[] = [];
  if (option === "delivery" && state.delivery) {
    if (state.delivery.eta) details.push(formatEtaPt(state.delivery.eta));
    details.push(
      state.delivery.mode === "fixed"
        ? `taxa ${formatBRL(state.delivery.feeCents)}`
        : "taxa conforme o bairro",
    );
  }
  if (option === "pickup" && state.pickup) {
    if (state.pickup.eta) details.push(formatEtaPt(state.pickup.eta));
    details.push("grátis");
  }
  return (
    <Radio
      checked={checked}
      className="foode-outline px-4 py-3"
      name="fulfillment"
      onChange={onChange}
      value={option}
    >
      <span className="block font-bold text-[var(--color-ink)]">
        {option === "delivery" ? "Delivery" : "Retirada na Loja"}
      </span>
      {details.length > 0 ? (
        <span className="block text-sm text-[var(--color-muted)]">{details.join(" · ")}</span>
      ) : null}
    </Radio>
  );
}

function BrandLines({ brands }: { brands: StorefrontStoreState["cardBrands"] }) {
  if (brands.debit.length === 0 && brands.credit.length === 0) return null;
  return (
    <dl className="grid gap-0.5 text-sm text-[var(--color-body)]">
      {brands.debit.length > 0 ? (
        <div className="flex gap-1">
          <dt className="font-bold text-[var(--color-ink)]">Débito:</dt>
          <dd className="m-0">{brands.debit.map((b) => CARD_BRAND_LABELS[b]).join(", ")}</dd>
        </div>
      ) : null}
      {brands.credit.length > 0 ? (
        <div className="flex gap-1">
          <dt className="font-bold text-[var(--color-ink)]">Crédito:</dt>
          <dd className="m-0">{brands.credit.map((b) => CARD_BRAND_LABELS[b]).join(", ")}</dd>
        </div>
      ) : null}
    </dl>
  );
}
