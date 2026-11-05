// Login do Consumidor por código no WhatsApp (decisão 65): regras, contrato das rotas e erros.
// Código de 4 dígitos, válido por 5 min, até 5 tentativas, reenvio após 30 s, uso único, guardado
// só como hash. Rate limit por telefone E por IP + Turnstile no pedido e na verificação. Nenhuma
// resposta revela se o telefone tem conta antes do código certo.
import { z } from "zod";

import { customerPhoneSchema } from "../order/checkout.js";

export const LOGIN_CODE_LENGTH = 4;
export const LOGIN_CODE_TTL_SECONDS = 300;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
export const LOGIN_CODE_RESEND_SECONDS = 30;

/**
 * Rate limits (janela ≤ 300 s: o Better Auth apaga de `rate_limits` as linhas mais velhas). O
 * reenvio de 30 s já segura o telefone; estes tetos contêm a varredura de números e de códigos.
 */
export const LOGIN_CODE_REQUEST_PHONE_LIMIT = { max: 3, windowSeconds: 300 } as const;
export const LOGIN_CODE_REQUEST_IP_LIMIT = { max: 10, windowSeconds: 300 } as const;
export const LOGIN_CODE_VERIFY_PHONE_LIMIT = { max: 10, windowSeconds: 300 } as const;
export const LOGIN_CODE_VERIFY_IP_LIMIT = { max: 20, windowSeconds: 300 } as const;

/**
 * Teto de códigos por telefone em 24 h (Ticket 30, revisão de segurança). Os limites de 300 s
 * acima ainda deixam ~10 palpites a cada 5 min no mesmo telefone (≈ 2 880/dia contra 10 000
 * códigos possíveis). Com no máximo 8 códigos/dia × 5 tentativas, são ≤ 40 palpites por dia.
 * Contado na própria `customer_login_codes` (a `rate_limits` só guarda janelas ≤ 300 s).
 */
export const LOGIN_CODE_DAILY_MAX_PER_PHONE = 8;
export const LOGIN_CODE_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

/** Mensagem exata enviada pelo WhatsApp (decisão 65). */
export function loginCodeMessage(code: string): string {
  return `${code} é o seu código de acesso ao Foode Delivery.`;
}

export const loginCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`, "u"), "o código tem 4 dígitos");

/** Turnstile: obrigatório no pedido e na verificação. */
const turnstileTokenSchema = z.string().min(1).max(2048);

export const customerCodeRequestSchema = z.object({
  phone: customerPhoneSchema,
  turnstileToken: turnstileTokenSchema,
});
export type CustomerCodeRequest = z.input<typeof customerCodeRequestSchema>;

export const customerCodeVerifySchema = z.object({
  phone: customerPhoneSchema,
  code: loginCodeSchema,
  turnstileToken: turnstileTokenSchema,
});
export type CustomerCodeVerify = z.input<typeof customerCodeVerifySchema>;

/** 200 do pedido de código: igual com ou sem conta (sem enumeração). */
export const customerCodeSentSchema = z.object({
  ok: z.literal(true),
  expiresInSeconds: z.number().int().positive(),
  resendAfterSeconds: z.number().int().positive(),
});
export type CustomerCodeSent = z.infer<typeof customerCodeSentSchema>;

/**
 * 200 do código certo (abre a sessão por cookie). `signup_required` = telefone verificado sem conta:
 * o próximo passo é nome + CPF (`POST /storefront/conta`).
 */
export const customerCodeVerifiedSchema = z.object({
  ok: z.literal(true),
  status: z.enum(["signed_in", "signup_required"]),
});
export type CustomerCodeVerified = z.infer<typeof customerCodeVerifiedSchema>;

// ---- Erros ------------------------------------------------------------------------------

export const CUSTOMER_ERROR_CODES = [
  "invalid_input",
  "login_unavailable",
  "captcha_failed",
  "rate_limited",
  "resend_too_soon",
  "code_invalid",
  "code_expired",
  "code_attempts_exhausted",
  "unauthenticated",
  "account_conflict",
  "store_not_found",
] as const;
export type CustomerErrorCode = (typeof CUSTOMER_ERROR_CODES)[number];

export const customerErrorSchema = z.discriminatedUnion("error", [
  z.object({ error: z.literal("invalid_input") }),
  z.object({ error: z.literal("login_unavailable") }),
  z.object({ error: z.literal("captcha_failed") }),
  z.object({ error: z.literal("rate_limited") }),
  z.object({
    error: z.literal("resend_too_soon"),
    retryAfterSeconds: z.number().int().min(1),
  }),
  z.object({ error: z.literal("code_invalid"), attemptsLeft: z.number().int().min(0) }),
  z.object({ error: z.literal("code_expired") }),
  z.object({ error: z.literal("code_attempts_exhausted") }),
  z.object({ error: z.literal("unauthenticated") }),
  z.object({ error: z.literal("account_conflict") }),
  z.object({ error: z.literal("store_not_found") }),
]);
export type CustomerError = z.infer<typeof customerErrorSchema>;

export function customerErrorHttpStatus(
  code: CustomerErrorCode,
): 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503 {
  switch (code) {
    case "invalid_input":
      return 400;
    case "unauthenticated":
      return 401;
    case "captcha_failed":
      return 403;
    case "store_not_found":
      return 404;
    case "account_conflict":
      return 409;
    case "code_invalid":
    case "code_expired":
    case "code_attempts_exhausted":
      return 422;
    case "rate_limited":
    case "resend_too_soon":
      return 429;
    case "login_unavailable":
      return 503;
  }
}

/** Mensagem do erro para o Storefront. `supportChatActive` = widget de suporte ligado (decisão 66). */
export function customerErrorMessagePt(
  error: CustomerError,
  options: { supportChatActive?: boolean } = {},
): string {
  switch (error.error) {
    case "invalid_input":
      return "Confira os dados informados.";
    case "login_unavailable":
      return "Login pelo WhatsApp indisponível no momento";
    case "captcha_failed":
      return "Não foi possível confirmar que você não é um robô. Tente de novo.";
    case "rate_limited":
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    case "resend_too_soon":
      return `Aguarde ${error.retryAfterSeconds} s para pedir um novo código.`;
    case "code_invalid":
      return error.attemptsLeft > 0
        ? `Código incorreto. Você ainda tem ${error.attemptsLeft} ${error.attemptsLeft === 1 ? "tentativa" : "tentativas"}.`
        : "Código incorreto. Peça um novo código.";
    case "code_expired":
      return "Este código expirou. Peça um novo código.";
    case "code_attempts_exhausted":
      return "Você errou o código muitas vezes. Peça um novo código.";
    case "unauthenticated":
      return "Entre com o seu WhatsApp para continuar.";
    case "account_conflict":
      return options.supportChatActive
        ? "Não foi possível concluir o cadastro. Fale com o suporte Foode pelo chat."
        : "Não foi possível concluir o cadastro.";
    case "store_not_found":
      return "Loja não encontrada.";
  }
}
