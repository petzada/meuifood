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
  // Ticket 23 (imagens do Cardápio, decisão 57). `MEDIA` (binding do bucket `foode-media`) lê,
  // confere (`head`) e apaga objetos; a URL PUT pré-assinada para o navegador precisa da API S3
  // do R2 (token de API R2 com escrita só nesse bucket). Secrets: R2_ACCESS_KEY_ID,
  // R2_SECRET_ACCESS_KEY. Vars: R2_ACCOUNT_ID, R2_PUBLIC_BASE_URL (leitura pública, sem assinatura).
  /** Nome do bucket (`foode-media`) para a assinatura S3; igual ao do binding MEDIA. */
  R2_BUCKET?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  /** Base pública de leitura das imagens, ex.: `https://media.foodedelivery.com.br`. */
  R2_PUBLIC_BASE_URL?: string;
};
