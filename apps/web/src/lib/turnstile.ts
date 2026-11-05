// Site key do Turnstile (pública) para a busca por telefone do checkout (P-2.1).
// Entra no build do Next como `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (deploy.yml passa a GitHub
// variable TURNSTILE_SITE_KEY). Sem chave fora de produção, usa a chave de teste da
// Cloudflare que sempre passa (a api de dev usa o secret de teste correspondente).

/** Chave pública de teste da Cloudflare: widget visível, sempre passa. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

export function turnstileSiteKey(): string {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (key) return key;
  // Produção sem a variável: o checkout abre e só a busca por telefone fica indisponível.
  if (process.env.NODE_ENV === "production") return "";
  return TURNSTILE_TEST_SITE_KEY;
}
