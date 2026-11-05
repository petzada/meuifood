import { getCloudflareContext } from "@opennextjs/cloudflare";

// Chamadas do servidor do Storefront para a api pelo service binding `API` (sem sair da
// Cloudflare). O host é só rótulo: o binding entrega direto ao Worker foode-api.
const BINDING_ORIGIN = "https://foode-api.internal";

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  return env.API.fetch(new Request(new URL(path, BINDING_ORIGIN), init));
}
