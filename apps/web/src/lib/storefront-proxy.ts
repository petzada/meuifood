// Encaminhamento dos route handlers do Storefront (Ticket 24a): o navegador fala só com o
// `web` (`/loja/{slug}/...`), que valida o corpo com o schema do contrato e repassa à api pelo
// binding `API`. Preço nunca vem do navegador; o IP do cliente segue em `cf-connecting-ip`
// para o rate limit e o Turnstile da busca por telefone. O `cookie` da sessão do Consumidor vai
// na ida (checkout com a conta e `useAccountCpf` do Cartão, decisão 65); nada volta dele.
import { storeSlugSchema } from "@foode/shared/menu";

import { apiFetch } from "./api";
import type { ContractSchema } from "./contract";
import { movedResponse, slugMovedTo } from "./slug-moved";

export type ForwardOptions<TRequest, TResponse> = {
  /** Caminho na api, já com o Slug validado. */
  apiPath: (slug: string) => string;
  /** Status que a api devolve com corpo no contrato da resposta (ex.: 409/422 do checkout). */
  contractStatuses?: readonly number[];
  requestSchema: ContractSchema<TRequest>;
  responseSchema: ContractSchema<TResponse>;
  /** Status repassados como vieram (corpo da api), ex.: 400 `invalid_input`, 429 `rate_limited`. */
  passthroughStatuses?: readonly number[];
  unavailableError: string;
};

export async function forwardStorefrontPost<TRequest, TResponse>(
  request: Request,
  slug: string,
  options: ForwardOptions<TRequest, TResponse>,
): Promise<Response> {
  const parsedSlug = storeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return Response.json({ error: "store_not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  const parsedBody = options.requestSchema.safeParse(body);
  if (!parsedBody.success) return Response.json({ error: "invalid_input" }, { status: 400 });

  const headers: Record<string, string> = { "content-type": "application/json" };
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers["cf-connecting-ip"] = clientIp;
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  let upstream: Response;
  try {
    upstream = await apiFetch(options.apiPath(parsedSlug.data), {
      body: JSON.stringify(parsedBody.data),
      headers,
      method: "POST",
      redirect: "manual",
    });
  } catch {
    return Response.json({ error: options.unavailableError }, { status: 502 });
  }

  // Link personalizado antigo (decisão 69): 308 para o mesmo caminho com o link atual.
  const currentSlug = await slugMovedTo(upstream);
  if (currentSlug) return movedResponse(request.url, currentSlug);

  const passthrough = options.passthroughStatuses ?? [400, 404];
  if (passthrough.includes(upstream.status)) {
    const payload: unknown = await upstream.json().catch(() => ({ error: "invalid_input" }));
    return Response.json(payload, { status: upstream.status });
  }
  const contractStatuses = options.contractStatuses ?? [];
  if (!upstream.ok && !contractStatuses.includes(upstream.status)) {
    return Response.json({ error: options.unavailableError }, { status: 502 });
  }

  const parsed = options.responseSchema.safeParse(await upstream.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: options.unavailableError }, { status: 502 });
  }
  return Response.json(parsed.data, {
    headers: { "cache-control": "no-store" },
    status: upstream.status,
  });
}
