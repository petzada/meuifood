// Bindings do Worker `foode-web` (wrangler.jsonc) usados pelo app.
declare global {
  interface CloudflareEnv {
    /** Fetch público da api (Storefront, /health) por service binding. */
    API: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
  }
}

export {};
