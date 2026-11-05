// Contrato do lead da landing (decisão 70: nome, WhatsApp, loja, cidade, pedidos/dia). É o
// contrato que `POST /contato/lead` valida e que a fatia de leads (D1 + `/ops` + e-mail)
// vai consumir. Validador puro, sem dependência nova no `web` (o lockfile é de outro
// agente); TODO(31-leads): trocar por `z.object(...)` quando a fatia de leads trouxer o zod
// para o `web`, mantendo os mesmos nomes de campo e mensagens.
import { normalizeBrazilianMobilePhone } from "@foode/shared";

export const ORDERS_PER_DAY_OPTIONS = ["ate_10", "10_a_50", "mais_de_50"] as const;
export type OrdersPerDay = (typeof ORDERS_PER_DAY_OPTIONS)[number];

export const ORDERS_PER_DAY_LABELS: Record<OrdersPerDay, string> = {
  ate_10: "Até 10",
  "10_a_50": "10 a 50",
  mais_de_50: "Mais de 50",
};

export type LeadInput = {
  name: string;
  /** Celular BR normalizado (só dígitos, `55DDD9…`, formato de `@foode/shared`). */
  whatsapp: string;
  storeName: string;
  city: string;
  ordersPerDay: OrdersPerDay;
  /** Origem (UTM/seção da página); opcional, só para rastreio. */
  source?: string;
};

export type LeadFieldErrors = Partial<Record<keyof LeadInput, string>>;

export type LeadParseResult =
  { success: true; data: LeadInput } | { success: false; errors: LeadFieldErrors };

const LIMITS = { name: 80, storeName: 80, city: 60, source: 120 } as const;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/gu, " ");
  if (trimmed.length < 2 || trimmed.length > max) return null;
  return trimmed;
}

export function parseLeadInput(raw: unknown): LeadParseResult {
  const errors: LeadFieldErrors = {};
  const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const name = text(body.name, LIMITS.name);
  if (!name) errors.name = "Informe seu nome.";

  const phone = normalizeBrazilianMobilePhone(
    typeof body.whatsapp === "string" ? body.whatsapp : "",
  );
  if (!phone.ok) errors.whatsapp = "Informe um celular com DDD, por exemplo (11) 99999-9999.";

  const storeName = text(body.storeName, LIMITS.storeName);
  if (!storeName) errors.storeName = "Informe o nome da sua loja.";

  const city = text(body.city, LIMITS.city);
  if (!city) errors.city = "Informe a cidade.";

  const ordersPerDay = body.ordersPerDay;
  const validOrders = (ORDERS_PER_DAY_OPTIONS as readonly unknown[]).includes(ordersPerDay);
  if (!validOrders) errors.ordersPerDay = "Escolha quantos pedidos por dia.";

  let source: string | undefined;
  if (body.source !== undefined && body.source !== "") {
    const parsed = text(body.source, LIMITS.source);
    if (parsed) source = parsed;
  }

  if (Object.keys(errors).length > 0 || !name || !phone.ok || !storeName || !city || !validOrders) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: {
      name,
      whatsapp: phone.e164,
      storeName,
      city,
      ordersPerDay: ordersPerDay as OrdersPerDay,
      ...(source !== undefined ? { source } : {}),
    },
  };
}

/** Resposta do route handler (contrato compartilhado com o formulário). */
export type LeadResponse =
  | { ok: true }
  | { ok: false; kind: "invalid"; errors: LeadFieldErrors }
  | { ok: false; kind: "unavailable"; message: string };

export const LEAD_UNAVAILABLE_MESSAGE =
  "Ainda não conseguimos receber seu contato por aqui. Chame no WhatsApp ou tente de novo em instantes.";
