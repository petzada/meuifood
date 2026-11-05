// Contrato do lead da landing (decisão 70): nome, WhatsApp, loja, cidade, pedidos/dia. O schema
// Zod mora em `@foode/shared/lead` (o mesmo que a api valida de novo); aqui ficam só a resposta
// do route handler `POST /contato/lead` e as mensagens que o formulário mostra.
export {
  type LeadFieldErrors,
  type LeadInput,
  type LeadParseResult,
  ORDERS_PER_DAY_LABELS,
  ORDERS_PER_DAY_OPTIONS,
  type OrdersPerDay,
  parseLeadInput,
} from "@foode/shared/lead";

import type { LeadFieldErrors } from "@foode/shared/lead";

/** Resposta do route handler (contrato compartilhado com o formulário). */
export type LeadResponse =
  | { ok: true }
  | { ok: false; kind: "invalid"; errors: LeadFieldErrors }
  | { ok: false; kind: "unavailable"; message: string };

export const LEAD_UNAVAILABLE_MESSAGE =
  "Ainda não conseguimos receber seu contato por aqui. Chame no WhatsApp ou tente de novo em instantes.";

export const LEAD_CAPTCHA_MESSAGE =
  "Não conseguimos confirmar a verificação de segurança. Tente de novo ou chame no WhatsApp.";

export const LEAD_RATE_LIMITED_MESSAGE =
  "Recebemos muitas tentativas deste endereço. Espere alguns minutos ou chame no WhatsApp.";
