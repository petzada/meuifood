import type { PainelRpc } from "@foode/shared";

// Bindings do Worker `foode-admin` (wrangler.jsonc) usados pelo app.
declare global {
  interface CloudflareEnv {
    /** Entrypoint RPC `PainelApi` da api (service binding). */
    API: PainelRpc;
  }
}
