// Bindings e variáveis do Worker `foode-api` (wrangler.jsonc). Segredos chegam por
// `wrangler secret bulk` no deploy (sincronizados dos secrets do GitHub) e são opcionais
// até o ticket que os usa.
export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ENVIRONMENT: string;
  SENTRY_DSN?: string;
  MILLIONSEND_API_KEY?: string;
};
