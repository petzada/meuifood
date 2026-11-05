// POST /contato/lead — recebe o formulário da landing (decisão 70), valida o contrato
// (`parseLeadInput`, o mesmo Zod de `@foode/shared/lead`) e repassa à api pelo binding `API`
// (`POST /storefront/leads`) com o token do Turnstile e o IP do navegador em `cf-connecting-ip`
// (rate limit por IP e `remoteip` do siteverify). A api grava no D1 e avisa a Foode por e-mail.
import { apiFetch } from "../../../lib/api";
import {
  LEAD_CAPTCHA_MESSAGE,
  LEAD_RATE_LIMITED_MESSAGE,
  LEAD_UNAVAILABLE_MESSAGE,
  parseLeadInput,
  type LeadResponse,
} from "../../../lib/lead";

export const dynamic = "force-dynamic";

const MAX_TOKEN_LENGTH = 2048;

function json(body: LeadResponse, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function unavailable(message: string, status: number): Response {
  return json({ ok: false, kind: "unavailable", message }, status);
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, kind: "invalid", errors: {} }, 400);
  }
  const parsed = parseLeadInput(raw);
  if (!parsed.success) {
    return json({ ok: false, kind: "invalid", errors: parsed.errors }, 400);
  }
  const token = (raw as { turnstileToken?: unknown }).turnstileToken;
  const turnstileToken = typeof token === "string" && token.length <= MAX_TOKEN_LENGTH ? token : "";

  const headers: Record<string, string> = { "content-type": "application/json" };
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers["cf-connecting-ip"] = clientIp;

  let upstream: Response;
  try {
    upstream = await apiFetch("/storefront/leads", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...parsed.data, turnstileToken }),
    });
  } catch {
    return unavailable(LEAD_UNAVAILABLE_MESSAGE, 502);
  }
  await upstream.body?.cancel();

  if (upstream.status === 201 || upstream.status === 200) return json({ ok: true }, 201);
  if (upstream.status === 400) return json({ ok: false, kind: "invalid", errors: {} }, 400);
  if (upstream.status === 403) return unavailable(LEAD_CAPTCHA_MESSAGE, 403);
  if (upstream.status === 429) return unavailable(LEAD_RATE_LIMITED_MESSAGE, 429);
  return unavailable(LEAD_UNAVAILABLE_MESSAGE, 502);
}
