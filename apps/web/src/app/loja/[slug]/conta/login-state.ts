// Regras do fluxo de entrada por código (Ticket 13, decisão 65) separadas da apresentação:
// máscara do CPF, validação local do cadastro (a api valida de novo) e o contador de reenvio.
// Puro: nenhuma referência a DOM.
import {
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_RESEND_SECONDS,
  cpfSchema,
  customerSignupSchema,
} from "@foode/shared/customer";
import { normalizeBrazilianMobilePhone } from "@foode/shared";
import { CUSTOMER_NAME_MAX } from "@foode/shared/order";

/** "123.456.789-09" a partir de qualquer digitação (só os 11 dígitos contam). */
export function formatCpfInput(raw: string): string {
  const digits = raw.replace(/\D/gu, "").slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean);
  const base = parts.join(".");
  return digits.length > 9 ? `${base}-${digits.slice(9)}` : base;
}

/** Só os dígitos do código, até 4 (o campo aceita colar com espaços). */
export function formatCodeInput(raw: string): string {
  return raw.replace(/\D/gu, "").slice(0, LOGIN_CODE_LENGTH);
}

export function phoneError(phone: string): string | null {
  if (!phone.trim()) return "Informe seu WhatsApp.";
  return normalizeBrazilianMobilePhone(phone).ok
    ? null
    : "Use um celular com DDD, como (11) 91234-5678.";
}

export function codeError(code: string): string | null {
  return code.length === LOGIN_CODE_LENGTH ? null : `Digite os ${LOGIN_CODE_LENGTH} dígitos.`;
}

export type SignupErrors = { cpf?: string; name?: string };

export function validateSignup(input: { cpf: string; name: string }): {
  errors: SignupErrors;
  ok: boolean;
} {
  const errors: SignupErrors = {};
  if (!input.name.trim()) errors.name = "Informe seu nome.";
  else if (input.name.trim().length > CUSTOMER_NAME_MAX) errors.name = "Nome muito longo.";
  if (!input.cpf.trim()) errors.cpf = "Informe seu CPF.";
  else if (!cpfSchema.safeParse(input.cpf).success)
    errors.cpf = "CPF inválido. Confira os dígitos.";
  if (Object.keys(errors).length === 0 && !customerSignupSchema.safeParse(input).success) {
    errors.name = "Confira os dados informados.";
  }
  return { errors, ok: Object.keys(errors).length === 0 };
}

/** Segundos até liberar "Reenviar código" (0 = liberado). */
export function resendSecondsLeft(
  sentAtMs: number,
  nowMs: number,
  resendAfterSeconds = LOGIN_CODE_RESEND_SECONDS,
): number {
  return Math.max(0, Math.ceil((sentAtMs + resendAfterSeconds * 1000 - nowMs) / 1000));
}
