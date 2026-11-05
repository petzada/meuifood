// Validação dos formulários de auth no navegador, com os Zod do contrato
// (`@foode/shared/auth`); a api valida de novo. Erros por campo em PT-BR.
// Sem importar `zod` aqui (não é dependência do admin): só a forma de `safeParse`.
import {
  loginInputSchema,
  PASSWORD_MIN_LENGTH,
  requestPasswordResetInputSchema,
  setPasswordInputSchema,
  type LoginInput,
  type RequestPasswordResetInput,
  type SetPasswordInput,
} from "@foode/shared/auth";

export type FieldErrors<T> = Partial<Record<keyof T | "form", string>>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors<T> };

type Issue = { path: ReadonlyArray<PropertyKey>; message: string };
type SafeParser<T> = {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: Issue[] } };
};

const MESSAGES: Record<string, string> = {
  email: "Informe um e-mail válido.",
  password: "Informe sua senha.",
  newPassword: `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  confirmPassword: "As senhas não conferem.",
  token: "Este link está incompleto. Abra o link do e-mail de novo.",
  turnstileToken: "Aguarde a verificação de segurança terminar.",
};

function parse<T>(schema: SafeParser<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!errors[field]) errors[field] = MESSAGES[field] ?? issue.message;
  }
  return { ok: false, errors: errors as FieldErrors<T> };
}

export function parseLoginForm(input: unknown): ParseResult<LoginInput> {
  return parse(loginInputSchema, input);
}

export function parsePasswordResetRequest(input: unknown): ParseResult<RequestPasswordResetInput> {
  return parse(requestPasswordResetInputSchema, input);
}

export function parseSetPasswordForm(input: unknown): ParseResult<SetPasswordInput> {
  return parse(setPasswordInputSchema, input);
}
