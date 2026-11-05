import type { PainelRpc } from "@foode/shared";

// Bindings do Worker `foode-admin` (wrangler.jsonc) usados pelo app.
declare global {
  interface CloudflareEnv {
    /** Entrypoint RPC `PainelApi` da api (service binding). */
    API: PainelRpc;
    /** Site key pública do Turnstile (login e esqueci a senha); vars do wrangler/deploy. */
    TURNSTILE_SITE_KEY?: string;
  }
}
