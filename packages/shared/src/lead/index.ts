// Subpath `@foode/shared/lead` (Ticket 31, decisão 70): contrato do lead da landing (nome,
// WhatsApp, loja, cidade, pedidos/dia), validado no navegador e no route handler do `web` e de
// novo na api; status e RPCs do Ops. Limites iguais aos CHECKs do D1 (schema/leads.ts).
import { z } from "zod";

import { normalizeBrazilianMobilePhone } from "../phone-br.js";

export const ORDERS_PER_DAY_OPTIONS = ["ate_10", "10_a_50", "mais_de_50"] as const;
export type OrdersPerDay = (typeof ORDERS_PER_DAY_OPTIONS)[number];

export const ORDERS_PER_DAY_LABELS: Readonly<Record<OrdersPerDay, string>> = {
  ate_10: "Até 10",
  "10_a_50": "10 a 50",
  mais_de_50: "Mais de 50",
};

export const LEAD_LIMITS = { name: 80, storeName: 80, city: 60, source: 120 } as const;

/** Teto do token do Turnstile (o verificador da api recusa acima disso). */
export const LEAD_TURNSTILE_TOKEN_MAX = 2048;

export const LEAD_MESSAGES = {
  name: "Informe seu nome.",
  whatsapp: "Informe um celular com DDD, por exemplo (11) 99999-9999.",
  storeName: "Informe o nome da sua loja.",
  city: "Informe a cidade.",
  ordersPerDay: "Escolha quantos pedidos por dia.",
} as const;

function textField(max: number, message: string) {
  return z
    .string(message)
    .transform((value) => value.trim().replace(/\s+/gu, " "))
    .pipe(z.string().min(2, message).max(max, message));
}

/** Origem opcional: vazia ou inválida vira ausente (só rastreio, nunca bloqueia o lead). */
const sourceSchema = z
  .unknown()
  .transform((value): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim().replace(/\s+/gu, " ");
    return trimmed.length >= 2 && trimmed.length <= LEAD_LIMITS.source ? trimmed : undefined;
  })
  .optional();

const whatsappSchema = z.string(LEAD_MESSAGES.whatsapp).transform((value, ctx) => {
  const phone = normalizeBrazilianMobilePhone(value);
  if (!phone.ok) {
    ctx.addIssue({ code: "custom", message: LEAD_MESSAGES.whatsapp });
    return z.NEVER;
  }
  return phone.e164;
});

/** Lead normalizado: textos aparados, WhatsApp `55DDD9…` (13 dígitos). */
export const leadInputSchema = z.object({
  name: textField(LEAD_LIMITS.name, LEAD_MESSAGES.name),
  whatsapp: whatsappSchema,
  storeName: textField(LEAD_LIMITS.storeName, LEAD_MESSAGES.storeName),
  city: textField(LEAD_LIMITS.city, LEAD_MESSAGES.city),
  ordersPerDay: z.enum(ORDERS_PER_DAY_OPTIONS, LEAD_MESSAGES.ordersPerDay),
  source: sourceSchema,
});
export type LeadInput = z.output<typeof leadInputSchema>;

/** Corpo de `POST /storefront/leads` na api: o lead + o token do Turnstile. */
export const leadCreateRequestSchema = leadInputSchema.extend({
  turnstileToken: z.string().max(LEAD_TURNSTILE_TOKEN_MAX).default(""),
});
export type LeadCreateRequest = z.output<typeof leadCreateRequestSchema>;

export type LeadFieldErrors = Partial<Record<keyof LeadInput, string>>;
export type LeadParseResult =
  { success: true; data: LeadInput } | { success: false; errors: LeadFieldErrors };

const LEAD_FIELDS = new Set<string>(["name", "whatsapp", "storeName", "city", "ordersPerDay"]);

/** Valida com o schema e devolve a primeira mensagem de cada campo (formulário da landing). */
export function parseLeadInput(raw: unknown): LeadParseResult {
  const body = typeof raw === "object" && raw !== null ? raw : {};
  const parsed = leadInputSchema.safeParse(body);
  if (parsed.success) {
    const { source, ...rest } = parsed.data;
    return { success: true, data: source === undefined ? rest : { ...rest, source } };
  }
  const errors: LeadFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || !LEAD_FIELDS.has(field)) continue;
    const key = field as keyof LeadFieldErrors;
    errors[key] ??= LEAD_MESSAGES[key as keyof typeof LEAD_MESSAGES];
  }
  return { success: false, errors };
}

// ---- Ops (Ticket 31): lista e status.

export const LEAD_STATUSES = ["new", "contacted", "converted", "discarded"] as const;
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const LEAD_STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
  new: "Novo",
  contacted: "Em contato",
  converted: "Virou Loja",
  discarded: "Descartado",
};

export const opsListLeadsInputSchema = z.object({ status: leadStatusSchema.optional() });
export type OpsListLeadsInput = z.infer<typeof opsListLeadsInputSchema>;

export const opsSetLeadStatusInputSchema = z.object({
  leadId: z.uuid(),
  status: leadStatusSchema,
});
export type OpsSetLeadStatusInput = z.infer<typeof opsSetLeadStatusInputSchema>;

/** Lead na lista do Ops. */
export type LeadView = {
  id: string;
  name: string;
  whatsapp: string;
  storeName: string;
  city: string;
  ordersPerDay: OrdersPerDay;
  source: string | null;
  status: LeadStatus;
  statusChangedAt: string | null;
  statusChangedByEmail: string | null;
  createdAt: string;
};

/** Rate limit da criação por hash do IP truncado (janela ≤ 300 s: limpeza do Better Auth). */
export const LEAD_RATE_LIMIT = { max: 3, windowSeconds: 300 } as const;
