// Formulários da área Ops (Ticket 29): lê o FormData do navegador, converte R$/%/horário de
// São Paulo para centavos/bp/UTC e valida com os Zod do contrato (`@foode/shared/ops`); a
// api valida de novo. Erros por campo em PT-BR, com a chave do campo (path com ".").
// Sem importar `zod` aqui (não é dependência do admin): só a forma de `safeParse`.
import {
  opsActivateStoreInputSchema,
  opsCreatePaymentFeesInputSchema,
  opsCreateProviderCostInputSchema,
  opsCreateStoreInputSchema,
  opsEndPaymentFeeInputSchema,
  opsEndProviderCostInputSchema,
  opsPublishPlanTiersInputSchema,
  opsSetCardModeInputSchema,
  opsSetStorePlanInputSchema,
  opsSuspendStoreInputSchema,
  opsUpdateStoreInputSchema,
} from "@foode/shared/ops";

import { parseMoneyToCents, parsePercentToBps, zonedInputToUtcIso } from "./ops-format";

export type FieldErrors = Record<string, string>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

type Issue = { code?: string; path: ReadonlyArray<PropertyKey>; message: string };
type SafeParser<T> = {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: Issue[] } };
};

/** Mensagens PT-BR por código do Zod; `custom` já vem em PT-BR do contrato. */
const CODE_MESSAGES: Record<string, string> = {
  invalid_type: "Preencha este campo.",
  too_small: "Preencha este campo.",
  too_big: "Texto longo demais.",
  invalid_format: "Formato inválido.",
  invalid_value: "Escolha uma opção válida.",
  invalid_union: "Valor inválido.",
  not_multiple_of: "Valor inválido.",
};

/** Mensagens por campo que vencem a genérica do código. */
const FIELD_MESSAGES: Record<string, string> = {
  slug: "Use 3 a 63 letras minúsculas, números ou hífen.",
  name: "Informe o nome da Loja.",
  "address.postalCode": "CEP inválido (8 dígitos).",
  "address.street": "Informe a rua.",
  "address.number": "Informe o número.",
  "address.district": "Informe o bairro.",
  "address.city": "Informe a cidade.",
  "address.state": "Escolha o estado.",
  "payout.holderName": "Informe o nome do titular.",
  "payout.pixKey.value": "Informe a chave Pix.",
  reason: "Descreva o motivo (3 a 500 caracteres).",
  validFrom: "Informe a data e hora de início.",
  validTo: "Informe uma data e hora válida.",
  percentBps: "Informe o percentual (ex.: 3,49).",
  fixedCents: "Informe o valor fixo em R$ (ex.: 0,60).",
  annualPriceCents: "Informe o preço do ano em R$.",
  priceCents: "Informe a Mensalidade em R$.",
  maxOrders: "Informe o fim da faixa ou deixe vazio na última.",
  minOrders: "Informe o início da faixa.",
};

export function parseWith<T>(schema: SafeParser<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.length === 0 ? "form" : issue.path.map(String).join(".");
    if (errors[field]) continue;
    const leaf = String(issue.path.at(-1) ?? "");
    errors[field] =
      issue.code === "custom"
        ? issue.message
        : (FIELD_MESSAGES[field] ??
          FIELD_MESSAGES[leaf] ??
          CODE_MESSAGES[issue.code ?? ""] ??
          issue.message);
  }
  return { ok: false, errors };
}

// ---- Leitura do FormData ----

export type FormLike = {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
};

export function text(form: FormLike, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function optionalText(form: FormLike, name: string): string | null {
  const value = text(form, name).trim();
  return value ? value : null;
}

/** Campo de R$ → centavos; texto inválido vira `NaN` para o Zod recusar no campo certo. */
function money(form: FormLike, name: string, fallback: number | null = null): number {
  const raw = text(form, name).trim();
  if (!raw && fallback !== null) return fallback;
  return parseMoneyToCents(raw) ?? Number.NaN;
}

function percentBps(form: FormLike, name: string): number {
  return parsePercentToBps(text(form, name)) ?? Number.NaN;
}

/** `datetime-local` em São Paulo → ISO UTC; texto inválido vira string vazia (Zod recusa). */
function instant(form: FormLike, name: string): string {
  return zonedInputToUtcIso(text(form, name)) ?? "";
}

function optionalInstant(form: FormLike, name: string): string | null {
  const raw = text(form, name).trim();
  if (!raw) return null;
  return zonedInputToUtcIso(raw) ?? "";
}

function integer(form: FormLike, name: string): number {
  const raw = text(form, name).trim();
  if (!/^\d+$/.test(raw)) return Number.NaN;
  return Number(raw);
}

function optionalInteger(form: FormLike, name: string): number | null {
  const raw = text(form, name).trim();
  if (!raw) return null;
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

/** Perfil da Loja do formulário (criação e edição): o Zod do contrato normaliza máscaras. */
export function readStoreProfile(form: FormLike) {
  return {
    slug: text(form, "slug"),
    name: text(form, "name"),
    cnpj: text(form, "cnpj"),
    whatsapp: text(form, "whatsapp"),
    address: {
      postalCode: text(form, "address.postalCode"),
      street: text(form, "address.street"),
      number: text(form, "address.number"),
      complement: optionalText(form, "address.complement"),
      district: text(form, "address.district"),
      city: text(form, "address.city"),
      state: text(form, "address.state"),
    },
    payout: {
      pixKey: { type: text(form, "payout.pixKey.type"), value: text(form, "payout.pixKey.value") },
      holderName: text(form, "payout.holderName"),
      holderDocument: text(form, "payout.holderDocument"),
    },
  };
}

export function parseCreateStore(form: FormLike) {
  return parseWith(opsCreateStoreInputSchema, readStoreProfile(form));
}

/**
 * Edição por seção: o formulário manda `sections` (ex.: "profile", "address", "payout") e
 * só esses blocos vão para a api (os demais ficam como estão).
 */
export function parseUpdateStore(form: FormLike, storeId: string) {
  const sections = new Set(form.getAll("sections").map(String));
  const profile = readStoreProfile(form);
  const input: Record<string, unknown> = { storeId };
  if (sections.has("profile")) {
    input.slug = profile.slug;
    input.name = profile.name;
    input.cnpj = profile.cnpj;
    input.whatsapp = profile.whatsapp;
  }
  if (sections.has("address")) input.address = profile.address;
  if (sections.has("payout")) input.payout = profile.payout;
  return parseWith(opsUpdateStoreInputSchema, input);
}

export function parseActivateStore(form: FormLike) {
  return parseWith(opsActivateStoreInputSchema, { storeId: text(form, "storeId") });
}

export function parseSuspendStore(form: FormLike) {
  return parseWith(opsSuspendStoreInputSchema, {
    storeId: text(form, "storeId"),
    reason: text(form, "reason"),
  });
}

export function parseSetCardMode(form: FormLike) {
  return parseWith(opsSetCardModeInputSchema, {
    storeId: text(form, "storeId"),
    cardMode: text(form, "cardMode"),
  });
}

export function parseSetStorePlan(form: FormLike) {
  return parseWith(opsSetStorePlanInputSchema, {
    storeId: text(form, "storeId"),
    cycle: text(form, "cycle"),
    validFrom: instant(form, "validFrom"),
  });
}

/** Faixas: linhas `tiers[i].minOrders|maxOrders|priceCents`, `tierCount` diz quantas há. */
export function parsePublishPlanTiers(form: FormLike) {
  const count = Math.max(0, Math.min(10, integer(form, "tierCount") || 0));
  const monthlyTiers = Array.from({ length: count }, (_, i) => ({
    minOrders: integer(form, `tiers.${i}.minOrders`),
    maxOrders: optionalInteger(form, `tiers.${i}.maxOrders`),
    priceCents: money(form, `tiers.${i}.priceCents`),
  }));
  return parseWith(opsPublishPlanTiersInputSchema, {
    validFrom: instant(form, "validFrom"),
    monthlyTiers,
    annualPriceCents: money(form, "annualPriceCents"),
  });
}

/** Uma taxa Foode por envio (a api aceita lote; a tela cadastra uma por vez). */
export function parseCreatePaymentFee(form: FormLike, storeId: string | null) {
  const method = text(form, "method");
  const cardMode = method === "credit" ? text(form, "cardMode") || null : null;
  const result = parseWith(opsCreatePaymentFeesInputSchema, {
    storeId,
    fees: [
      {
        method,
        cardMode,
        percentBps: percentBps(form, "percentBps"),
        fixedCents: money(form, "fixedCents", 0),
        validFrom: instant(form, "validFrom"),
        validTo: optionalInstant(form, "validTo"),
      },
    ],
  });
  if (result.ok) return result;
  // Erros de `fees.0.x` voltam como `x` (há um único formulário).
  const errors: FieldErrors = {};
  for (const [key, message] of Object.entries(result.errors)) {
    errors[key.replace(/^fees\.0\./, "").replace(/^fees\.\d+$/, "form")] = message;
  }
  return { ok: false as const, errors };
}

export function parseEndPaymentFee(form: FormLike) {
  return parseWith(opsEndPaymentFeeInputSchema, {
    feeId: text(form, "feeId"),
    validTo: instant(form, "validTo"),
  });
}

export function parseCreateProviderCost(form: FormLike) {
  return parseWith(opsCreateProviderCostInputSchema, {
    provider: text(form, "provider"),
    operation: text(form, "operation"),
    percentBps: percentBps(form, "percentBps"),
    fixedCents: money(form, "fixedCents", 0),
    validFrom: instant(form, "validFrom"),
    validTo: optionalInstant(form, "validTo"),
  });
}

export function parseEndProviderCost(form: FormLike) {
  return parseWith(opsEndProviderCostInputSchema, {
    costId: text(form, "costId"),
    validTo: instant(form, "validTo"),
  });
}

/** Estado devolvido pelas server actions aos formulários (`useActionState`). */
export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors: FieldErrors;
};

export const IDLE_FORM: FormState = { status: "idle", errors: {} };

export function formError(errors: FieldErrors, message?: string): FormState {
  return { status: "error", errors, ...(message ? { message } : {}) };
}

export function formSuccess(message: string): FormState {
  return { status: "success", errors: {}, message };
}
