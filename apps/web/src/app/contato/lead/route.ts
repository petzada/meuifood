// POST /contato/lead — recebe o formulário da landing (decisão 70). Esta fatia valida o
// contrato (`parseLeadInput`) e responde 503 controlado: a gravação no D1, a lista no `/ops`,
// o Turnstile, o rate limit e o e-mail pela MillionSend ficam na fatia de leads.
// TODO(31-leads): gravar o lead e responder `{ ok: true }`.
import { LEAD_UNAVAILABLE_MESSAGE, parseLeadInput, type LeadResponse } from "../../../lib/lead";

export const dynamic = "force-dynamic";

function json(body: LeadResponse, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
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
  return json({ ok: false, kind: "unavailable", message: LEAD_UNAVAILABLE_MESSAGE }, 503);
}
