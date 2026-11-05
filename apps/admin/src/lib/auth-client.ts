// Chamadas do navegador aos endpoints do Better Auth, sempre pelo próprio Painel
// (`/api/auth/*`, proxy para a api). O token do Turnstile vai no header `x-captcha-response`.
// Erros viram códigos de negócio com mensagem em PT-BR; nunca lançam.

export type AuthFailure =
  "credentials" | "captcha" | "rate_limited" | "invalid_token" | "network" | "unknown";

export type AuthOutcome = { ok: true } | { ok: false; error: AuthFailure };

export const AUTH_FAILURE_MESSAGES: Record<AuthFailure, string> = {
  credentials: "E-mail ou senha incorretos.",
  captcha: "Não conseguimos confirmar que você não é um robô. Tente de novo.",
  rate_limited: "Muitas tentativas. Aguarde um instante e tente de novo.",
  invalid_token: "Este link expirou ou já foi usado. Peça um novo.",
  network: "Sem conexão com o Painel. Verifique sua internet e tente de novo.",
  unknown: "Algo deu errado. Tente de novo em instantes.",
};

type Fetch = typeof fetch;

export async function classifyFailure(response: Response): Promise<AuthFailure> {
  if (response.status === 429) return "rate_limited";
  let code = "";
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    code = String(body.code ?? body.message ?? "").toUpperCase();
  } catch {
    // corpo vazio ou não JSON
  }
  if (code.includes("CAPTCHA")) return "captcha";
  if (code.includes("TOKEN")) return "invalid_token";
  if (response.status === 401 || code.includes("INVALID_EMAIL_OR_PASSWORD")) return "credentials";
  if (response.status === 403) return "captcha";
  return "unknown";
}

async function post(
  path: string,
  body: Record<string, unknown>,
  turnstileToken: string | null,
  fetchImpl: Fetch,
): Promise<AuthOutcome> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (turnstileToken) headers["x-captcha-response"] = turnstileToken;
  let response: Response;
  try {
    response = await fetchImpl(`/api/auth/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: "network" };
  }
  if (response.ok) return { ok: true };
  return { ok: false, error: await classifyFailure(response) };
}

export function signInWithEmail(
  input: { email: string; password: string; turnstileToken: string },
  fetchImpl: Fetch = fetch,
): Promise<AuthOutcome> {
  const { turnstileToken, ...body } = input;
  return post("sign-in/email", body, turnstileToken, fetchImpl);
}

/** Resposta igual exista ou não o e-mail (a api garante); o link leva a /definir-senha. */
export function requestPasswordReset(
  input: { email: string; turnstileToken: string },
  fetchImpl: Fetch = fetch,
): Promise<AuthOutcome> {
  return post(
    "request-password-reset",
    { email: input.email, redirectTo: "/definir-senha" },
    input.turnstileToken,
    fetchImpl,
  );
}

/** Convite e reset usam o mesmo token de uso único. */
export function resetPassword(
  input: { token: string; newPassword: string; turnstileToken: string },
  fetchImpl: Fetch = fetch,
): Promise<AuthOutcome> {
  return post(
    "reset-password",
    { token: input.token, newPassword: input.newPassword },
    input.turnstileToken,
    fetchImpl,
  );
}

export function signOut(fetchImpl: Fetch = fetch): Promise<AuthOutcome> {
  return post("sign-out", {}, null, fetchImpl);
}
