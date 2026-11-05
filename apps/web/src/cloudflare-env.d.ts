// Bindings do Worker `foode-web` (wrangler.jsonc) usados pelo app.
declare global {
  interface CloudflareEnv {
    /** Fetch público da api (Storefront, /health) por service binding. */
    API: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
    /**
     * WhatsApp de vendas da Foode (secret do Worker, decisão 70): só `/falar` lê, no servidor.
     * Nunca no HTML nem no repositório. Ausente = `/falar` leva ao formulário de contato.
     */
    SALES_WHATSAPP?: string;
  }
}

export {};
