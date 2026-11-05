// Bindings e variáveis do Worker `foode-api` (wrangler.jsonc). Segredos chegam por
// `wrangler secret bulk` no deploy (sincronizados dos secrets do GitHub) e são opcionais
// até o ticket que os usa.
export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ENVIRONMENT: string;
  SENTRY_DSN?: string;
  MILLIONSEND_API_KEY?: string;
  // Ticket 22 (Auth). Secrets: BETTER_AUTH_SECRET, TURNSTILE_SECRET_KEY. Vars: as demais.
  /** Segredo do Better Auth; ausente em produção = erro (nunca usar o padrão). */
  BETTER_AUTH_SECRET?: string;
  /** URL pública do Painel (o admin repassa `/api/auth/*`): base dos links e da origem. */
  BETTER_AUTH_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Remetente dos e-mails, ex.: `Foode <nao-responda@foodedelivery.com.br>`. */
  EMAIL_FROM?: string;
  // Ticket 23 (imagens do Cardápio, decisões 57/59/64). `MEDIA` (binding do bucket `foode-media`)
  // grava, lê e apaga objetos `stores/{store_id}/menu/{uuid}.{ext}`; sem credenciais S3.
  /** Base pública de leitura = rota `/media` da api, ex.: `https://api.foodedelivery.com.br/media`. */
  MEDIA_PUBLIC_BASE_URL?: string;
  // Ticket 24a (Pedido). Secrets, só no Worker (nunca em arquivo/log):
  /**
   * Chave do HMAC que deriva o token da página do Pedido a partir do id (o banco guarda só o
   * SHA-256 do token; o Painel remonta o link do "Avisar no WhatsApp"). Trocar invalida os links.
   */
  ORDER_TOKEN_SECRET?: string;
  /** Sal do hash do IP truncado na auditoria/rate limit da busca por telefone (P-2.1). */
  PHONE_LOOKUP_IP_SALT?: string;
};
