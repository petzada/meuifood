// Encaminhamento das rotas da conta do Consumidor (Ticket 13, decisão 65): o navegador fala só
// com o `web` (`/conta/*`), que valida o corpo com o schema do contrato e repassa à api pelo
// binding `API`. A sessão vive no cookie `__Host-foode_consumidor`: o `cookie` vai na ida e o
// `set-cookie` volta como veio. O IP segue em `cf-connecting-ip` para o rate limit.
//
// Erros do contrato (`customerErrorSchema`) passam com o status da api; qualquer outra resposta
// vira `account_unavailable` (502) sem corpo da api — telefone, CPF e código nunca aparecem em
// log nem em mensagem.
import { customerErrorSchema } from "@foode/shared/customer";

import { apiFetch } from "./api";
import type { ContractSchema } from "./contract";

export const ACCOUNT_UNAVAILABLE = "account_unavailable";

export type AccountForwardOptions<TRequest, TResponse> = {
  apiPath: string;
  method: "GET" | "POST";
  /** Sem schema = sem corpo (GET, sair). */
  requestSchema?: ContractSchema<TRequest>;
  /** Sem schema = resposta sem corpo (204). */
  responseSchema?: ContractSchema<TResponse>;
};

function upstreamHeaders(request: Request, withBody: boolean): Headers {
  const headers = new Headers();
  if (withBody) headers.set("content-type", "application/json");
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("cf-connecting-ip", clientIp);
  return headers;
}

/** Resposta ao navegador com o `set-cookie` da api preservado e sem cache. */
function respond(upstream: Response, body: BodyInit | null, status: number): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (body !== null) headers.set("content-type", "application/json");
  // `getSetCookie` mantém cada cookie numa linha (o `get` juntaria com vírgula).
  for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return new Response(body, { headers, status });
}

export async function forwardAccount<TRequest, TResponse>(
  request: Request,
  options: AccountForwardOptions<TRequest, TResponse>,
): Promise<Response> {
  let payload: string | undefined;
  if (options.requestSchema) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }
    const parsed = options.requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
    payload = JSON.stringify(parsed.data);
  }

  let upstream: Response;
  try {
    upstream = await apiFetch(options.apiPath, {
      ...(payload !== undefined ? { body: payload } : {}),
      headers: upstreamHeaders(request, payload !== undefined),
      method: options.method,
      redirect: "manual",
    });
  } catch {
    return Response.json({ error: ACCOUNT_UNAVAILABLE }, { status: 502 });
  }

  if (!upstream.ok) {
    const error = customerErrorSchema.safeParse(await upstream.json().catch(() => null));
    if (!error.success) return Response.json({ error: ACCOUNT_UNAVAILABLE }, { status: 502 });
    return respond(upstream, JSON.stringify(error.data), upstream.status);
  }

  if (!options.responseSchema) return respond(upstream, null, 204);
  const parsed = options.responseSchema.safeParse(await upstream.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: ACCOUNT_UNAVAILABLE }, { status: 502 });
  return respond(upstream, JSON.stringify(parsed.data), upstream.status);
}
