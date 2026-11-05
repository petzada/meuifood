import type { PainelRpc } from "@foode/shared";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** RPC da api para o servidor do Painel (service binding `API` → entrypoint PainelApi). */
export async function painelApi(): Promise<PainelRpc> {
  const { env } = await getCloudflareContext({ async: true });
  return env.API;
}
