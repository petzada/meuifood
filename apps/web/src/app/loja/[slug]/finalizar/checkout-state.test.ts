// Regras do checkout sem DOM: máscaras, validação (ordem = ordem visual), mínimo, troco,
// corpo do contrato e "Lembrar meus dados neste aparelho" por Loja.
import { describe, expect, it } from "vitest";

import { ids, neighborhoodIds, storeState } from "../storefront/fixtures";
import {
  applyAddress,
  buildCreateRequest,
  changeForCents,
  checkoutCtaLabel,
  createCheckoutForm,
  forgetRememberedCustomer,
  formatPhoneBr,
  formatPostalCode,
  localTotals,
  parseRememberedCustomer,
  readRememberedCustomer,
  rememberedFromForm,
  validateCheckout,
  writeRememberedCustomer,
  type CheckoutForm,
} from "./checkout-state";

const lines = [{ additionalIds: [], complementSelections: {}, itemId: ids.soda, quantity: 4 }];

function filled(overrides: Partial<CheckoutForm> = {}): CheckoutForm {
  return {
    ...createCheckoutForm(storeState),
    address: {
      complement: "",
      neighborhoodId: neighborhoodIds.centro,
      neighborhoodName: "",
      noNumber: false,
      number: "42",
      postalCode: "",
      reference: "",
      street: "Rua A",
    },
    fulfillment: "delivery",
    name: "Maria Souza",
    payment: "on_delivery",
    phone: "(11) 91234-5678",
    ...overrides,
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("máscaras", () => {
  it("formata o WhatsApp enquanto digita e aceita colar com +55", () => {
    expect(formatPhoneBr("1")).toBe("(1");
    expect(formatPhoneBr("119")).toBe("(11) 9");
    expect(formatPhoneBr("11912345678")).toBe("(11) 91234-5678");
    expect(formatPhoneBr("+55 (11) 91234-5678")).toBe("(11) 91234-5678");
    expect(formatPhoneBr("")).toBe("");
  });

  it("formata o CEP e lê o troco em reais", () => {
    expect(formatPostalCode("01310100")).toBe("01310-100");
    expect(changeForCents("")).toBeNull();
    expect(changeForCents("50")).toBe(5000);
    expect(changeForCents("R$ 50,50")).toBe(5050);
    expect(changeForCents("abc")).toBeNull();
  });
});

describe("formulário inicial", () => {
  it("pré-seleciona Fulfillment e meio só quando há um único", () => {
    const both = createCheckoutForm(storeState);
    expect(both.fulfillment).toBeNull();
    expect(both.payment).toBe("on_delivery");
    expect(both.remember).toBe(true);
    const pickupOnly = createCheckoutForm({
      ...storeState,
      delivery: null,
      paymentMethods: ["pix", "on_delivery"],
    });
    expect(pickupOnly.fulfillment).toBe("pickup");
    expect(pickupOnly.payment).toBeNull();
  });

  it("'Sou eu' pré-seleciona o bairro só se o nome bater com um bairro ativo", () => {
    const matched = applyAddress(
      createCheckoutForm(storeState).address,
      {
        complement: "ap 1",
        neighborhood: "jardim américa",
        number: "S/N",
        postalCode: "01310100",
        reference: null,
        street: "Rua B",
      },
      storeState,
    );
    expect(matched.neighborhoodId).toBe(neighborhoodIds.jardim);
    expect(matched.noNumber).toBe(true);
    expect(matched.postalCode).toBe("01310-100");
    const unmatched = applyAddress(
      createCheckoutForm(storeState).address,
      {
        complement: null,
        neighborhood: "Outro",
        number: "1",
        postalCode: null,
        reference: null,
        street: "Rua B",
      },
      storeState,
    );
    expect(unmatched.neighborhoodId).toBe("");
  });
});

describe("validateCheckout", () => {
  const context = { state: storeState, subtotalCents: 2400, totalCents: 2900 };

  it("formulário completo passa e o CTA traz o total", () => {
    const result = validateCheckout(filled(), context);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
    expect(checkoutCtaLabel(result, 2900, false)).toBe("Fazer pedido · R$ 29,00");
    expect(checkoutCtaLabel(result, 2900, true)).toBe("Enviando…");
  });

  it("aponta a primeira pendência na ordem da tela e o CTA diz o que falta", () => {
    const empty = validateCheckout(createCheckoutForm(storeState), context);
    expect(empty.firstError).toBe("phone");
    expect(checkoutCtaLabel(empty, 2900, false)).toBe("Preencha seus dados");
    const noFulfillment = validateCheckout(filled({ fulfillment: null }), context);
    expect(noFulfillment.firstError).toBe("fulfillment");
    expect(checkoutCtaLabel(noFulfillment, 2900, false)).toBe("Escolha como receber");
    const noNeighborhood = validateCheckout(
      filled({ address: { ...filled().address, neighborhoodId: "" } }),
      context,
    );
    expect(noNeighborhood.errors.neighborhoodId).toBe("Escolha o bairro.");
    expect(checkoutCtaLabel(noNeighborhood, 2900, false)).toBe("Complete o endereço");
  });

  it("rejeita telefone fixo e exige número salvo com 'Sem número'", () => {
    expect(validateCheckout(filled({ phone: "(11) 3123-4567" }), context).errors.phone).toMatch(
      /celular/u,
    );
    const noNumber = filled({ address: { ...filled().address, noNumber: true, number: "" } });
    expect(validateCheckout(noNumber, context).errors.number).toBeUndefined();
    const missing = filled({ address: { ...filled().address, number: "" } });
    expect(validateCheckout(missing, context).errors.number).toMatch(/Sem número/u);
  });

  it("Retirada não valida endereço", () => {
    const pickup = filled({
      address: createCheckoutForm(storeState).address,
      fulfillment: "pickup",
    });
    expect(validateCheckout(pickup, context).ok).toBe(true);
  });

  it("pedido mínimo só no Delivery, sobre o subtotal sem a taxa (P-2.5)", () => {
    const below = validateCheckout(filled(), { ...context, subtotalCents: 1400, totalCents: 1900 });
    expect(below.ok).toBe(false);
    expect(below.minimum).toEqual({ minimumCents: 2000, missingCents: 600 });
    expect(checkoutCtaLabel(below, 1900, false)).toBe("Faltam R$ 6,00 para o pedido mínimo");
    const pickup = validateCheckout(filled({ fulfillment: "pickup" }), {
      ...context,
      subtotalCents: 1400,
      totalCents: 1400,
    });
    expect(pickup.minimum).toBeNull();
    expect(pickup.ok).toBe(true);
  });

  it("troco: opcional, mas quando informado precisa ser ≥ total (P-4.2)", () => {
    expect(validateCheckout(filled({ changeFor: "" }), context).errors.changeFor).toBeUndefined();
    expect(validateCheckout(filled({ changeFor: "20" }), context).errors.changeFor).toBe(
      "O troco precisa ser para R$ 29,00 ou mais.",
    );
    expect(validateCheckout(filled({ changeFor: "29" }), context).errors.changeFor).toBeUndefined();
    expect(validateCheckout(filled({ changeFor: "x" }), context).errors.changeFor).toMatch(
      /valor/u,
    );
  });

  it("meio fora da lista do servidor e observação longa são recusados", () => {
    const pix = validateCheckout(filled({ payment: "pix" }), context);
    expect(pix.errors.payment).toMatch(/não está disponível/u);
    const long = validateCheckout(filled({ note: "x".repeat(201) }), context);
    expect(long.errors.note).toBe("Até 200 caracteres.");
  });
});

describe("corpo do contrato e totais locais", () => {
  it("manda só ids, quantidades e dados do Consumidor; 'Sem número' vira S/N", () => {
    const body = buildCreateRequest(
      filled({
        changeFor: "50",
        note: "  sem cebola ",
        address: { ...filled().address, noNumber: true, postalCode: "01310-100" },
      }),
      lines,
      storeState,
      "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
    );
    expect(body).toEqual({
      address: {
        complement: null,
        neighborhoodId: neighborhoodIds.centro,
        neighborhoodName: null,
        number: "S/N",
        postalCode: "01310100",
        reference: null,
        street: "Rua A",
      },
      couponCode: null,
      customer: { name: "Maria Souza", phone: "(11) 91234-5678" },
      fulfillment: "delivery",
      idempotencyKey: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
      lines,
      note: "sem cebola",
      payment: { changeForCents: 5000, method: "on_delivery" },
    });
    expect(JSON.stringify(body)).not.toContain("priceCents");
  });

  it("Taxa fixa usa o bairro em texto livre; Retirada vai sem endereço", () => {
    const fixed = {
      ...storeState,
      delivery: { eta: null, feeCents: 700, minimumOrderCents: null, mode: "fixed" as const },
    };
    const body = buildCreateRequest(
      filled({ address: { ...filled().address, neighborhoodId: "", neighborhoodName: "Vila" } }),
      lines,
      fixed,
      "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
    );
    expect(body.address).toMatchObject({ neighborhoodId: null, neighborhoodName: "Vila" });
    expect(localTotals(fixed, filled(), 2400)).toEqual({
      deliveryFeeCents: 700,
      discountCents: 0,
      subtotalCents: 2400,
      totalCents: 3100,
    });
    const pickup = buildCreateRequest(
      filled({ fulfillment: "pickup" }),
      lines,
      storeState,
      "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
    );
    expect(pickup.address).toBeNull();
    expect(localTotals(storeState, filled(), 2400).deliveryFeeCents).toBe(500);
  });
});

describe("lembrar meus dados neste aparelho (P-2.2)", () => {
  it("grava por Loja, lê de volta e apaga na hora", () => {
    const storage = memoryStorage();
    const customer = rememberedFromForm(filled(), storeState)!;
    expect(customer).toEqual({
      address: {
        complement: null,
        neighborhood: "Centro",
        number: "42",
        postalCode: null,
        reference: null,
        street: "Rua A",
      },
      name: "Maria Souza",
      phone: "5511912345678",
    });
    writeRememberedCustomer(storage, "lanchonete-do-ze", customer);
    expect(readRememberedCustomer(storage, "outra-loja")).toBeNull();
    expect(readRememberedCustomer(storage, "lanchonete-do-ze")).toEqual(customer);
    const form = createCheckoutForm(storeState, customer);
    expect(form.name).toBe("Maria Souza");
    expect(form.phone).toBe("(11) 91234-5678");
    expect(form.address.neighborhoodId).toBe(neighborhoodIds.centro);
    forgetRememberedCustomer(storage, "lanchonete-do-ze");
    expect(readRememberedCustomer(storage, "lanchonete-do-ze")).toBeNull();
  });

  it("conteúdo inválido no aparelho vira null", () => {
    expect(parseRememberedCustomer({ name: "x", phone: "123" })).toBeNull();
    expect(
      parseRememberedCustomer({ address: { street: 1 }, name: "x", phone: "5511912345678" }),
    ).toBeNull();
    expect(parseRememberedCustomer("{")).toBeNull();
    const storage = memoryStorage();
    storage.setItem("foode:cliente:lanchonete-do-ze", "{nope");
    expect(readRememberedCustomer(storage, "lanchonete-do-ze")).toBeNull();
    expect(rememberedFromForm(filled({ phone: "x" }), storeState)).toBeNull();
  });
});
