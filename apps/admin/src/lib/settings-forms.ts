// Formulários da configuração operacional (Ticket 24b): lê o FormData do navegador e valida com
// os Zod do contrato (`@foode/shared/order`); a api valida de novo. Erros por campo em PT-BR,
// com a chave do campo (path com "."), no mesmo padrão de `ops-forms.ts`.
import {
  CARD_BRANDS,
  MAX_DELIVERY_NEIGHBORHOODS,
  MAX_OPENING_PERIODS,
  storeSetCardBrandsInputSchema,
  storeSetFulfillmentInputSchema,
  storeSetHoursInputSchema,
  storeSetPrintOnAcceptInputSchema,
} from "@foode/shared/order";

import { parseMoneyToCents } from "./ops-format";
import { type FieldErrors, type FormLike, parseWith, text } from "./ops-forms";

const HOURS_MESSAGES: Record<string, string> = {
  opensAt: "Informe o início (HH:MM).",
  closesAt: "Informe o fim (HH:MM).",
  "custom:o início precisa ser antes do fim": "O início precisa ser antes do fim.",
  "custom:invalid_period": "O início precisa ser antes do fim.",
  "custom:overlap": "Este período se sobrepõe a outro do mesmo dia.",
  "custom:too_many_periods": "No máximo 4 períodos por dia.",
};

function integer(form: FormLike, name: string): number {
  const raw = text(form, name).trim();
  return /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
}

function optionalInteger(form: FormLike, name: string): number | null {
  const raw = text(form, name).trim();
  if (!raw) return null;
  return /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
}

function optionalMoney(form: FormLike, name: string): number | null {
  const raw = text(form, name).trim();
  if (!raw) return null;
  return parseMoneyToCents(raw) ?? Number.NaN;
}

function checked(form: FormLike, name: string): boolean {
  return text(form, name) === "on" || text(form, name) === "true";
}

/** Grade: linhas `periods.i.weekday|opensAt|closesAt`, `periodCount` diz quantas há. */
export function parseSetHours(form: FormLike) {
  const count = Math.max(0, Math.min(MAX_OPENING_PERIODS, integer(form, "periodCount") || 0));
  const periods = Array.from({ length: count }, (_, i) => ({
    weekday: integer(form, `periods.${i}.weekday`),
    opensAt: text(form, `periods.${i}.opensAt`),
    closesAt: text(form, `periods.${i}.closesAt`),
  }));
  return parseWith(storeSetHoursInputSchema, { periods }, HOURS_MESSAGES);
}

const FULFILLMENT_MESSAGES: Record<string, string> = {
  fixedFeeCents: "Informe a Taxa fixa em R$ (ex.: 5,00).",
  "custom:informe a Taxa fixa": "Informe a Taxa fixa em R$ (ex.: 5,00).",
  "custom:ative pelo menos um bairro": "Ative pelo menos um bairro para entregar por bairro.",
  "custom:bairro repetido": "Este bairro já está na lista.",
  "custom:o mínimo não pode passar do máximo": "O mínimo não pode passar do máximo.",
  name: "Informe o nome do bairro.",
  feeCents: "Informe a taxa em R$ (0,00 para grátis).",
  deliveryMinimumOrderCents: "Informe um valor em R$ maior que zero ou deixe vazio.",
  minMinutes: "Informe os minutos (1 a 240).",
  maxMinutes: "Informe os minutos (1 a 240).",
};

function etaRange(form: FormLike, prefix: string) {
  const min = optionalInteger(form, `${prefix}.minMinutes`);
  const max = optionalInteger(form, `${prefix}.maxMinutes`);
  if (min === null && max === null) return null;
  return { minMinutes: min ?? Number.NaN, maxMinutes: max ?? Number.NaN };
}

/**
 * Entrega: `pickupEnabled`, `deliveryMode` ("none" | "neighborhood" | "fixed"), `fixedFeeCents`,
 * bairros em `neighborhoods.i.id|name|feeCents|active` com `neighborhoodCount`, pedido mínimo e
 * tempos `deliveryEta.*` / `pickupEta.*`.
 */
export function parseSetFulfillment(form: FormLike) {
  const mode = text(form, "deliveryMode");
  const count = Math.max(
    0,
    Math.min(MAX_DELIVERY_NEIGHBORHOODS, integer(form, "neighborhoodCount") || 0),
  );
  const neighborhoods = Array.from({ length: count }, (_, i) => {
    const id = text(form, `neighborhoods.${i}.id`).trim();
    return {
      ...(id ? { id } : {}),
      name: text(form, `neighborhoods.${i}.name`),
      feeCents: parseMoneyToCents(text(form, `neighborhoods.${i}.feeCents`) || "0") ?? Number.NaN,
      active: checked(form, `neighborhoods.${i}.active`),
    };
  });
  return parseWith(
    storeSetFulfillmentInputSchema,
    {
      pickupEnabled: checked(form, "pickupEnabled"),
      deliveryMode: mode === "neighborhood" || mode === "fixed" ? mode : null,
      fixedFeeCents: optionalMoney(form, "fixedFeeCents"),
      neighborhoods,
      deliveryMinimumOrderCents: optionalMoney(form, "deliveryMinimumOrderCents"),
      deliveryEta: etaRange(form, "deliveryEta"),
      pickupEta: etaRange(form, "pickupEta"),
    },
    FULFILLMENT_MESSAGES,
  );
}

/** Bandeiras: checkboxes `debit` e `credit` com o código da bandeira como valor. */
export function parseSetCardBrands(form: FormLike) {
  const pick = (name: string) =>
    form
      .getAll(name)
      .map(String)
      .filter((brand) => (CARD_BRANDS as readonly string[]).includes(brand));
  return parseWith(storeSetCardBrandsInputSchema, {
    debit: pick("debit"),
    credit: pick("credit"),
  });
}

export function parseSetPrintOnAccept(form: FormLike) {
  return parseWith(storeSetPrintOnAcceptInputSchema, {
    printOnAccept: checked(form, "printOnAccept"),
  });
}

/** Erros `periods.3.closesAt` → por índice, para a grade mostrar inline no período certo. */
export function periodErrors(errors: FieldErrors): Map<number, string> {
  const byIndex = new Map<number, string>();
  for (const [key, message] of Object.entries(errors)) {
    const match = /^periods\.(\d+)/u.exec(key);
    if (match) byIndex.set(Number(match[1]), message);
  }
  return byIndex;
}
