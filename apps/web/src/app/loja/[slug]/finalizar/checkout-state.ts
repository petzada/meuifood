// Estado do checkout separado da apresentação (critério 20.2): formulário, validações no
// navegador (a api valida de novo no Pedido), totais locais enquanto a cotação não chega
// (G7), rótulo do CTA que diz o que falta (G2), corpo do contrato e "Lembrar meus dados neste
// aparelho" (P-2.2) por Loja no `localStorage`. Puro: nenhuma referência a DOM.
import type { CartLine } from "@foode/shared/menu";
import { formatBRL, reaisToCents } from "@foode/shared/money";
import { normalizeBrazilianMobilePhone, normalizeNeighborhoodKey } from "@foode/shared";
import {
  ADDRESS_COMPLEMENT_MAX,
  ADDRESS_NUMBER_MAX,
  ADDRESS_REFERENCE_MAX,
  CUSTOMER_NAME_MAX,
  ORDER_NOTE_MAX,
  STREET_MAX,
  isValidChangeFor,
  minimumOrderGap,
  type CheckoutCreateRequestInput,
  type Fulfillment,
  type OrderAddressView,
  type OrderTotals,
  type PaymentMethod,
  type StorefrontStoreState,
} from "@foode/shared/order";

// ---- Formulário.

export type CheckoutAddress = {
  complement: string;
  neighborhoodId: string;
  /** Texto livre só na Taxa fixa. */
  neighborhoodName: string;
  noNumber: boolean;
  number: string;
  postalCode: string;
  reference: string;
  street: string;
};

export type CheckoutForm = {
  address: CheckoutAddress;
  /** "Troco para" em reais digitados ("50" ou "50,00"); vazio = sem troco. */
  changeFor: string;
  /** Cupom promocional aplicado pelo Consumidor (Ticket 13); vazio = nenhum. */
  couponCode: string;
  fulfillment: Fulfillment | null;
  name: string;
  note: string;
  payment: PaymentMethod | null;
  /** Telefone como digitado (máscara aplicada na tela). */
  phone: string;
  remember: boolean;
};

export const emptyAddress: CheckoutAddress = {
  complement: "",
  neighborhoodId: "",
  neighborhoodName: "",
  noNumber: false,
  number: "",
  postalCode: "",
  reference: "",
  street: "",
};

/** Opções de Fulfillment ativas na Loja (X3: com uma só, texto fixo sem escolha). */
export function availableFulfillments(
  state: Pick<StorefrontStoreState, "delivery" | "pickup">,
): Fulfillment[] {
  const options: Fulfillment[] = [];
  if (state.delivery) options.push("delivery");
  if (state.pickup) options.push("pickup");
  return options;
}

export function createCheckoutForm(
  state: Pick<StorefrontStoreState, "delivery" | "pickup" | "paymentMethods">,
  remembered: RememberedCustomer | null = null,
): CheckoutForm {
  const fulfillments = availableFulfillments(state);
  const methods = state.paymentMethods;
  return {
    address: remembered?.address
      ? applyAddress(emptyAddress, remembered.address, state)
      : emptyAddress,
    changeFor: "",
    couponCode: "",
    fulfillment: fulfillments.length === 1 ? fulfillments[0]! : null,
    name: remembered?.name ?? "",
    note: "",
    payment: methods.length === 1 ? methods[0]! : null,
    phone: remembered ? formatPhoneBr(remembered.phone) : "",
    remember: true,
  };
}

/**
 * Preenche o endereço vindo da busca por telefone ("Sou eu") ou do aparelho: o bairro só é
 * pré-selecionado se o nome bater com um bairro ativo da lista (P-3.1/P-2.1).
 */
export function applyAddress(
  current: CheckoutAddress,
  address: OrderAddressView,
  state: Pick<StorefrontStoreState, "delivery">,
): CheckoutAddress {
  const noNumber = address.number.trim().toUpperCase() === "S/N";
  return {
    ...current,
    complement: address.complement ?? "",
    neighborhoodId: matchNeighborhoodId(state, address.neighborhood) ?? "",
    neighborhoodName: state.delivery?.mode === "fixed" ? address.neighborhood : "",
    noNumber,
    number: noNumber ? "" : address.number,
    postalCode: address.postalCode ? formatPostalCode(address.postalCode) : "",
    reference: address.reference ?? "",
    street: address.street,
  };
}

/**
 * Preenche o checkout com a conta do Consumidor (Ticket 13, decisão 68): nome, telefone e o
 * último endereço de Delivery da conta (vale em qualquer Loja). Não mexe no que não vem da conta.
 */
export function applyAccount(
  form: CheckoutForm,
  account: { lastAddress: OrderAddressView | null; name: string; phone: string },
  state: Pick<StorefrontStoreState, "delivery">,
): CheckoutForm {
  return {
    ...form,
    address: account.lastAddress
      ? applyAddress(form.address, account.lastAddress, state)
      : form.address,
    name: account.name,
    phone: formatPhoneBr(account.phone),
  };
}

export function matchNeighborhoodId(
  state: Pick<StorefrontStoreState, "delivery">,
  name: string | null | undefined,
): string | null {
  if (!name || state.delivery?.mode !== "neighborhood") return null;
  const key = normalizeNeighborhoodKey(name);
  return (
    state.delivery.neighborhoods.find((n) => normalizeNeighborhoodKey(n.name) === key)?.id ?? null
  );
}

// ---- Máscaras.

/** "(11) 91234-5678" a partir de qualquer digitação; aceita colar com +55/espaços. */
export function formatPhoneBr(raw: string): string {
  let digits = raw.replace(/\D/gu, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  const ddd = digits.slice(0, 2);
  const first = digits.slice(2, 7);
  const last = digits.slice(7, 11);
  if (digits.length <= 2) return digits.length ? `(${ddd}` : "";
  if (digits.length <= 7) return `(${ddd}) ${first}`;
  return `(${ddd}) ${first}-${last}`;
}

export function formatPostalCode(raw: string): string {
  const digits = raw.replace(/\D/gu, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function postalCodeDigits(raw: string): string | null {
  const digits = raw.replace(/\D/gu, "");
  return digits.length === 8 ? digits : null;
}

/** "Troco para" em centavos; null quando vazio; NaN-safe (texto inválido vira null). */
export function changeForCents(raw: string): number | null {
  if (!raw.trim()) return null;
  return reaisToCents(raw);
}

// ---- Totais locais (até a cotação do servidor chegar; a api é a fonte de verdade, G7).

export function localDeliveryFeeCents(
  state: Pick<StorefrontStoreState, "delivery">,
  form: Pick<CheckoutForm, "address" | "fulfillment">,
): number {
  if (form.fulfillment !== "delivery" || !state.delivery) return 0;
  if (state.delivery.mode === "fixed") return state.delivery.feeCents;
  return (
    state.delivery.neighborhoods.find((n) => n.id === form.address.neighborhoodId)?.feeCents ?? 0
  );
}

export function localTotals(
  state: Pick<StorefrontStoreState, "delivery">,
  form: Pick<CheckoutForm, "address" | "fulfillment">,
  subtotalCents: number,
): OrderTotals {
  const deliveryFeeCents = localDeliveryFeeCents(state, form);
  return {
    deliveryFeeCents,
    discountCents: 0,
    subtotalCents,
    totalCents: subtotalCents + deliveryFeeCents,
  };
}

// ---- Validação (ordem = ordem visual, para focar a primeira pendência).

export const CHECKOUT_FIELDS = [
  "phone",
  "name",
  "fulfillment",
  "postalCode",
  "street",
  "number",
  "neighborhoodId",
  "neighborhoodName",
  "complement",
  "reference",
  "payment",
  "changeFor",
  "note",
] as const;
export type CheckoutField = (typeof CHECKOUT_FIELDS)[number];

export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

export type CheckoutValidation = {
  errors: CheckoutErrors;
  firstError: CheckoutField | null;
  /** Faixa "Faltam R$ X" (P-2.5): só Delivery, sobre o subtotal dos itens. */
  minimum: { minimumCents: number; missingCents: number } | null;
  ok: boolean;
};

export function validateCheckout(
  form: CheckoutForm,
  context: {
    state: Pick<StorefrontStoreState, "delivery" | "pickup" | "paymentMethods">;
    subtotalCents: number;
    totalCents: number;
  },
): CheckoutValidation {
  const errors: CheckoutErrors = {};
  const { state } = context;

  if (!form.name.trim()) errors.name = "Informe seu nome.";
  else if (form.name.trim().length > CUSTOMER_NAME_MAX) errors.name = "Nome muito longo.";

  if (!form.phone.trim()) errors.phone = "Informe seu WhatsApp.";
  else if (!normalizeBrazilianMobilePhone(form.phone).ok) {
    errors.phone = "Use um celular com DDD, como (11) 91234-5678.";
  }

  const fulfillments = availableFulfillments(state);
  if (fulfillments.length === 0) errors.fulfillment = "A Loja não está recebendo pedidos agora.";
  else if (!form.fulfillment || !fulfillments.includes(form.fulfillment)) {
    errors.fulfillment = "Escolha como receber.";
  }

  if (form.fulfillment === "delivery" && state.delivery) {
    const a = form.address;
    if (a.postalCode && !postalCodeDigits(a.postalCode)) errors.postalCode = "CEP com 8 dígitos.";
    if (!a.street.trim()) errors.street = "Informe a rua.";
    else if (a.street.trim().length > STREET_MAX) errors.street = "Rua muito longa.";
    if (!a.noNumber) {
      if (!a.number.trim()) errors.number = "Informe o número ou marque “Sem número”.";
      else if (a.number.trim().length > ADDRESS_NUMBER_MAX) errors.number = "Número muito longo.";
    }
    if (state.delivery.mode === "neighborhood") {
      if (!state.delivery.neighborhoods.some((n) => n.id === a.neighborhoodId)) {
        errors.neighborhoodId = "Escolha o bairro.";
      }
    } else if (!a.neighborhoodName.trim()) {
      errors.neighborhoodName = "Informe o bairro.";
    }
    if (a.complement.trim().length > ADDRESS_COMPLEMENT_MAX) {
      errors.complement = "Complemento muito longo.";
    }
    if (a.reference.trim().length > ADDRESS_REFERENCE_MAX) {
      errors.reference = "Referência muito longa.";
    }
  }

  if (!form.payment) errors.payment = "Escolha como pagar.";
  else if (!state.paymentMethods.includes(form.payment)) {
    errors.payment = "Esse meio de pagamento não está disponível.";
  }

  if (form.payment === "on_delivery" && form.changeFor.trim()) {
    const cents = changeForCents(form.changeFor);
    if (cents === null || cents <= 0) errors.changeFor = "Informe um valor, como 50 ou 50,00.";
    else if (!isValidChangeFor(context.totalCents, cents)) {
      errors.changeFor = `O troco precisa ser para ${formatBRL(context.totalCents)} ou mais.`;
    }
  }

  if (form.note.length > ORDER_NOTE_MAX) errors.note = `Até ${ORDER_NOTE_MAX} caracteres.`;

  const minimum =
    form.fulfillment === "delivery" && state.delivery
      ? minimumOrderGap(context.subtotalCents, state.delivery.minimumOrderCents)
      : null;

  const firstError = CHECKOUT_FIELDS.find((field) => errors[field]) ?? null;
  const belowMinimum = minimum !== null && minimum.missingCents > 0;
  return { errors, firstError, minimum, ok: firstError === null && !belowMinimum };
}

/** Rótulo do CTA (G1/G2): próxima ação + total, ou o que falta. */
export function checkoutCtaLabel(
  validation: Pick<CheckoutValidation, "errors" | "firstError" | "minimum">,
  totalCents: number,
  submitting: boolean,
): string {
  if (submitting) return "Enviando…";
  if (validation.minimum && validation.minimum.missingCents > 0) {
    return `Faltam ${formatBRL(validation.minimum.missingCents)} para o pedido mínimo`;
  }
  switch (validation.firstError) {
    case null:
      return `Fazer pedido · ${formatBRL(totalCents)}`;
    case "name":
    case "phone":
      return "Preencha seus dados";
    case "fulfillment":
      return "Escolha como receber";
    case "postalCode":
    case "street":
    case "number":
    case "neighborhoodId":
    case "neighborhoodName":
    case "complement":
    case "reference":
      return "Complete o endereço";
    case "payment":
      return "Escolha como pagar";
    case "changeFor":
      return "Confira o troco";
    case "note":
      return "Encurte a observação";
  }
}

// ---- Corpo do contrato (só ids, quantidades e dados do Consumidor; preço nunca vai).

export type CartBody = {
  address: CheckoutCreateRequestInput["address"];
  /** Cupom promocional digitado (Ticket 13); null = só o boas-vindas automático, se elegível. */
  couponCode: string | null;
  fulfillment: Fulfillment;
  lines: CartLine[];
};

export function buildCartBody(
  form: Pick<CheckoutForm, "address" | "couponCode" | "fulfillment">,
  lines: CartLine[],
  state: Pick<StorefrontStoreState, "delivery">,
): CartBody {
  const fulfillment = form.fulfillment ?? "pickup";
  const couponCode = form.couponCode.trim() || null;
  if (fulfillment !== "delivery") return { address: null, couponCode, fulfillment, lines };
  const a = form.address;
  const byNeighborhood = state.delivery?.mode === "neighborhood";
  return {
    couponCode,
    address: {
      complement: a.complement.trim() || null,
      neighborhoodId: byNeighborhood ? a.neighborhoodId || null : null,
      neighborhoodName: byNeighborhood ? null : a.neighborhoodName.trim() || null,
      number: a.noNumber ? "S/N" : a.number.trim(),
      postalCode: postalCodeDigits(a.postalCode),
      reference: a.reference.trim() || null,
      street: a.street.trim(),
    },
    fulfillment,
    lines,
  };
}

export function buildCreateRequest(
  form: CheckoutForm,
  lines: CartLine[],
  state: Pick<StorefrontStoreState, "delivery">,
  idempotencyKey: string,
): CheckoutCreateRequestInput {
  const change = form.payment === "on_delivery" ? changeForCents(form.changeFor) : null;
  return {
    ...buildCartBody(form, lines, state),
    customer: { name: form.name.trim(), phone: form.phone },
    idempotencyKey,
    note: form.note.trim() || null,
    payment: { changeForCents: change, method: form.payment ?? "on_delivery" },
  };
}

// ---- "Lembrar meus dados neste aparelho" (P-2.2): por Loja, apagável na hora.

export type RememberedCustomer = {
  address: OrderAddressView | null;
  name: string;
  /** E.164 sem "+". */
  phone: string;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Valida o que veio do `localStorage` (conteúdo de outra versão vira null). */
export function parseRememberedCustomer(input: unknown): RememberedCustomer | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  if (typeof data.name !== "string" || !data.name.trim()) return null;
  if (typeof data.phone !== "string" || !/^55\d{11}$/u.test(data.phone)) return null;
  let address: OrderAddressView | null = null;
  if (data.address !== null && data.address !== undefined) {
    if (typeof data.address !== "object") return null;
    const a = data.address as Record<string, unknown>;
    if (
      typeof a.street !== "string" ||
      typeof a.number !== "string" ||
      typeof a.neighborhood !== "string" ||
      !isNullableString(a.complement) ||
      !isNullableString(a.postalCode) ||
      !isNullableString(a.reference)
    ) {
      return null;
    }
    address = {
      complement: a.complement,
      neighborhood: a.neighborhood,
      number: a.number,
      postalCode: a.postalCode,
      reference: a.reference,
      street: a.street,
    };
  }
  return { address, name: data.name, phone: data.phone };
}

export function rememberedCustomerKey(storeSlug: string): string {
  return `foode:cliente:${storeSlug}`;
}

export type CustomerStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function readRememberedCustomer(
  storage: CustomerStorage,
  storeSlug: string,
): RememberedCustomer | null {
  const raw = storage.getItem(rememberedCustomerKey(storeSlug));
  if (!raw) return null;
  try {
    return parseRememberedCustomer(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** O que fica no aparelho depois de um Pedido enviado com "Lembrar" marcado. */
export function rememberedFromForm(
  form: CheckoutForm,
  state: Pick<StorefrontStoreState, "delivery">,
): RememberedCustomer | null {
  const phone = normalizeBrazilianMobilePhone(form.phone);
  if (!phone.ok || !form.name.trim()) return null;
  const a = form.address;
  const neighborhood =
    state.delivery?.mode === "neighborhood"
      ? (state.delivery.neighborhoods.find((n) => n.id === a.neighborhoodId)?.name ?? "")
      : a.neighborhoodName.trim();
  const hasAddress = form.fulfillment === "delivery" && a.street.trim();
  return {
    address: hasAddress
      ? {
          complement: a.complement.trim() || null,
          neighborhood,
          number: a.noNumber ? "S/N" : a.number.trim(),
          postalCode: postalCodeDigits(a.postalCode),
          reference: a.reference.trim() || null,
          street: a.street.trim(),
        }
      : null,
    name: form.name.trim(),
    phone: phone.e164,
  };
}

export function writeRememberedCustomer(
  storage: CustomerStorage,
  storeSlug: string,
  customer: RememberedCustomer,
): void {
  storage.setItem(rememberedCustomerKey(storeSlug), JSON.stringify(customer));
}

export function forgetRememberedCustomer(storage: CustomerStorage, storeSlug: string): void {
  storage.removeItem(rememberedCustomerKey(storeSlug));
}
