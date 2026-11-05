// Site key do Turnstile (pública) para o widget de login e "esqueci a senha". Em produção
// chega pela var `TURNSTILE_SITE_KEY` do Worker (deploy.yml passa a GitHub variable); no
// `next dev`, por `process.env`. Sem chave fora de produção, usa a chave de teste da
// Cloudflare que sempre passa (o secret de teste correspondente fica na api de dev).
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Chave pública de teste da Cloudflare: widget visível, sempre passa. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

export async function turnstileSiteKey(): Promise<string> {
  let fromWorker: string | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    fromWorker = env.TURNSTILE_SITE_KEY;
  } catch {
    // fora do Worker (testes)
  }
  const key = (fromWorker ?? process.env.TURNSTILE_SITE_KEY)?.trim();
  if (key) return key;
  // Produção sem a var: a tela abre (smoke do deploy) e avisa que a verificação está
  // indisponível, em vez de derrubar o login com um 500.
  if (process.env.NODE_ENV === "production") return "";
  return TURNSTILE_TEST_SITE_KEY;
}
