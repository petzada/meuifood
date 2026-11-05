// Proxy de `/api/auth/*` (Better Auth) do Painel para a api pelo service binding.
// O navegador só fala com o Painel: o cookie de sessão fica first-party neste host e o
// Set-Cookie da api volta intacto. O IP real vem de `cf-connecting-ip` (Cloudflare grava o
// header na borda antes de chegar ao Worker); qualquer valor que um cliente tente mandar por
// outro header é ignorado.

export const CLIENT_IP_HEADER = "cf-connecting-ip";

/** Headers hop-by-hop ou que a api não deve herdar do navegador. */
const DROP_REQUEST_HEADERS = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "transfer-encoding",
];

export type AuthProxyTarget = { fetch(request: Request): Promise<Response> };

/** IP real da request na borda; `null` fora da Cloudflare (dev local). */
export function clientIp(request: Request): string | null {
  const ip = request.headers.get(CLIENT_IP_HEADER)?.trim();
  return ip ? ip : null;
}

export async function proxyAuthRequest(request: Request, api: AuthProxyTarget): Promise<Response> {
  const headers = new Headers(request.headers);
  for (const name of DROP_REQUEST_HEADERS) headers.delete(name);
  const ip = clientIp(request);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  // A api recusa `/api/auth/*` sem o IP. Fora da Cloudflare (`next dev`) não há borda:
  // loopback só em desenvolvimento; em produção o header ausente segue ausente.
  else if (process.env.NODE_ENV !== "production") headers.set(CLIENT_IP_HEADER, "127.0.0.1");
  else headers.delete(CLIENT_IP_HEADER);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : null;
  const upstream = new Request(request.url, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  const response = await api.fetch(upstream);
  // Resposta repassada como veio (status, Set-Cookie e Location do reset de senha).
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
