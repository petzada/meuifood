// Loja sintética do smoke E2E (Ticket 30, decisão 67) — SQL para o workflow `e2e-producao.yml`.
//
// A Loja `smoke-foode` é FIXA e idempotente: ids constantes, isolada da Loja Piloto, sem Plano
// (fora de cobrança/faixa) e sem pagamento online (só "Pagamento na entrega"). Ela fica `active`
// com horário 00:00–23:59 todos os dias e só retirada, para o checkout funcionar a qualquer hora.
//
// Autenticação no Painel SEM senha e SEM mexer no Turnstile: o login por formulário exige o
// Turnstile real (que não se resolve em navegador automatizado e não pode ser desligado). Em vez
// dele, o workflow grava no D1 uma sessão do Better Auth de vida curta para dois usuários
// sintéticos SEM conta `credential` (não há senha que possa vazar ou ser usada no formulário):
//   - `smoke-operador@foode.invalid` — Operador só da Loja de smoke;
//   - `smoke-ops@foode.invalid`      — `foode_ops` SÓ durante o smoke (o cleanup tira o papel).
// O cookie `__Secure-better-auth.session_token` é assinado aqui com BETTER_AUTH_SECRET (mesmo
// HMAC-SHA256 do better-call) e entregue ao Playwright num arquivo 0600 do runner. O cleanup
// (`if: always()`) apaga as sessões, os Pedidos/eventos da Loja de smoke e despromove o Ops.
//
// Uso (CI):
//   BETTER_AUTH_SECRET=... node scripts/e2e/smoke-store.mjs seed <seed.sql> <estado.json>
//   node scripts/e2e/smoke-store.mjs cleanup <cleanup.sql>
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SESSION_COOKIE_NAME = "__Secure-better-auth.session_token";
/** Vida da sessão gravada pelo seed (o cleanup apaga antes disso). */
export const SESSION_TTL_MINUTES = 45;

export const SMOKE_STORE = {
  id: "00000000-0000-4000-8000-00000000e2e0",
  slug: "smoke-foode",
  name: "Loja Smoke (teste automático)",
};

/** Perfil fictício (CNPJ de exemplo com dígito verificador válido; nada de dado real). */
export const SMOKE_PROFILE = {
  cnpj: "11222333000181",
  whatsapp: "5511900000000",
  postalCode: "01310100",
  street: "Avenida Paulista",
  number: "1000",
  district: "Bela Vista",
  city: "São Paulo",
  state: "SP",
  pixKeyType: "random",
  pixKey: "smoke-foode-chave-ficticia",
  holderName: "Loja Smoke (teste)",
  holderDocument: "11222333000181",
};

export const SMOKE_USERS = {
  operator: {
    id: "00000000-0000-4000-8000-00000000e2e1",
    email: "smoke-operador@foode.invalid",
    name: "Operador Smoke",
  },
  ops: {
    id: "00000000-0000-4000-8000-00000000e2e2",
    email: "smoke-ops@foode.invalid",
    name: "Ops Smoke",
  },
};

export const SMOKE_MENU = {
  category: { id: "00000000-0000-4000-8000-00000000e2e3", name: "Smoke" },
  items: [
    {
      id: "00000000-0000-4000-8000-00000000e2e4",
      name: "Smoke Burger",
      description: "Item sintético do teste automático.",
      priceCents: 2500,
    },
    {
      id: "00000000-0000-4000-8000-00000000e2e5",
      name: "Suco Smoke",
      description: "Item sintético do teste automático.",
      priceCents: 800,
    },
  ],
};

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_PATTERN = /^[A-Za-z0-9]{32}$/u;

/** Literal SQL com aspas simples escapadas. */
export function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Token de sessão no formato do Better Auth (32 alfanuméricos, sem viés de módulo). */
export function randomSessionToken(length = 32) {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte < 248 && out.length < length) out += TOKEN_ALPHABET[byte % 62];
    }
  }
  return out;
}

/**
 * Valor do cookie de sessão como o Better Auth grava: `encodeURIComponent(token.assinatura)`,
 * assinatura = base64(HMAC-SHA256(secret, token)) — `signCookieValue` do better-call.
 */
export function signSessionCookie(token, secret) {
  if (!TOKEN_PATTERN.test(token)) throw new Error("token de sessão inválido");
  if (typeof secret !== "string" || secret.trim() === "") {
    throw new Error("BETTER_AUTH_SECRET ausente");
  }
  const signature = createHmac("sha256", secret.trim()).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

const storeId = quote(SMOKE_STORE.id);
const smokeEmails = `(${quote(SMOKE_USERS.operator.email)}, ${quote(SMOKE_USERS.ops.email)})`;

/**
 * Limpeza dos dados de smoke (também roda no começo do seed, para a fila nascer vazia): Pedidos
 * da Loja de smoke e o que depende deles, contadores do funil, auditoria operacional e Pausa.
 * Só a Loja de smoke (id fixo) é tocada. Pagamento online não existe nela; se uma tabela nova
 * passar a referenciar o Pedido, o DELETE falha pela FK e o job avisa (nunca apaga às cegas).
 */
function purgeStatements() {
  return [
    `DELETE FROM order_cancellations WHERE store_id = ${storeId};`,
    `DELETE FROM phone_lookups WHERE store_id = ${storeId};`,
    `DELETE FROM coupon_redemptions WHERE store_id = ${storeId};`,
    `DELETE FROM order_status_events WHERE store_id = ${storeId};`,
    `DELETE FROM order_lines WHERE store_id = ${storeId};`,
    `DELETE FROM orders WHERE store_id = ${storeId};`,
    `DELETE FROM store_funnel_daily WHERE store_id = ${storeId};`,
    `DELETE FROM audit_events WHERE store_id = ${storeId} AND action <> 'store.created';`,
    `UPDATE store_operation_settings SET paused = 0, paused_at = NULL, paused_by_user_id = NULL,
  paused_by_role = NULL, updated_at = ${NOW}
  WHERE store_id = ${storeId} AND paused = 1;`,
    `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email IN ${smokeEmails});`,
  ];
}

/** SQL do fim do smoke (`if: always()`): limpa e tira o papel `foode_ops` do usuário sintético. */
export function buildCleanupSql() {
  return `${[
    ...purgeStatements(),
    `UPDATE users SET platform_role = NULL, updated_at = ${NOW}
  WHERE email = ${quote(SMOKE_USERS.ops.email)} AND platform_role IS NOT NULL;`,
  ].join("\n")}\n`;
}

/**
 * SQL idempotente do começo do smoke. `sessions` = `{ operator, ops }` com tokens de sessão;
 * `expiresAt` em ISO-8601 UTC com milissegundos; `newId` injetável para teste.
 */
export function buildSeedSql({ sessions, expiresAt, newId = () => randomUUID() }) {
  for (const key of ["operator", "ops"]) {
    if (!TOKEN_PATTERN.test(sessions?.[key] ?? "")) throw new Error(`token inválido: ${key}`);
  }
  if (new Date(expiresAt).toISOString() !== expiresAt) throw new Error("expiresAt inválido");
  const p = SMOKE_PROFILE;
  const { operator, ops } = SMOKE_USERS;
  const statements = [...purgeStatements()];

  // Usuários sintéticos SEM conta credential (sem senha). O Ops ganha o papel só agora.
  statements.push(
    `INSERT INTO users (id, email, name, email_verified, platform_role, created_at, updated_at)
  VALUES (${quote(operator.id)}, ${quote(operator.email)}, ${quote(operator.name)}, 1, NULL, ${NOW}, ${NOW})
  ON CONFLICT (email) DO UPDATE SET platform_role = NULL, updated_at = ${NOW}
  WHERE users.platform_role IS NOT NULL;`,
    `INSERT INTO users (id, email, name, email_verified, platform_role, created_at, updated_at)
  VALUES (${quote(ops.id)}, ${quote(ops.email)}, ${quote(ops.name)}, 1, 'foode_ops', ${NOW}, ${NOW})
  ON CONFLICT (email) DO UPDATE SET platform_role = 'foode_ops', updated_at = ${NOW};`,
    `DELETE FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email IN ${smokeEmails});`,
  );

  // Loja: id fixo; se o Slug já for de outra Loja, a UNIQUE falha e o smoke para (nunca invade).
  statements.push(
    `INSERT INTO stores (id, slug, name, status, created_at, updated_at)
  VALUES (${storeId}, ${quote(SMOKE_STORE.slug)}, ${quote(SMOKE_STORE.name)}, 'active', ${NOW}, ${NOW})
  ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, name = excluded.name, status = 'active',
    updated_at = excluded.updated_at
  WHERE stores.slug IS NOT excluded.slug OR stores.name IS NOT excluded.name OR stores.status <> 'active';`,
    `INSERT INTO store_profiles (store_id, cnpj, whatsapp, address_postal_code, address_street,
    address_number, address_complement, address_district, address_city, address_state,
    payout_pix_key_type, payout_pix_key, payout_holder_name, payout_holder_document, card_mode,
    created_at, updated_at)
  VALUES (${storeId}, ${quote(p.cnpj)}, ${quote(p.whatsapp)}, ${quote(p.postalCode)}, ${quote(p.street)},
    ${quote(p.number)}, NULL, ${quote(p.district)}, ${quote(p.city)}, ${quote(p.state)},
    ${quote(p.pixKeyType)}, ${quote(p.pixKey)}, ${quote(p.holderName)}, ${quote(p.holderDocument)}, NULL,
    ${NOW}, ${NOW})
  ON CONFLICT (store_id) DO NOTHING;`,
    `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
  SELECT ${quote(newId())}, ${NOW}, NULL, s.id, 'store.created', 'store', s.id,
    json_object('before', NULL, 'after', json_object('slug', s.slug, 'name', s.name, 'status', s.status),
      'source', 'e2e-producao')
  FROM stores s WHERE s.id = ${storeId}
    AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.store_id = s.id AND a.action = 'store.created');`,
    // Só retirada (sem entrega nem pagamento online): o checkout depende só deste estado.
    `INSERT INTO store_operation_settings (store_id, paused, pickup_enabled, delivery_mode,
    pickup_eta_min_minutes, pickup_eta_max_minutes, print_on_accept, created_at, updated_at)
  VALUES (${storeId}, 0, 1, NULL, 10, 20, 0, ${NOW}, ${NOW})
  ON CONFLICT (store_id) DO UPDATE SET paused = 0, paused_at = NULL, paused_by_user_id = NULL,
    paused_by_role = NULL, pickup_enabled = 1, delivery_mode = NULL, delivery_fixed_fee_cents = NULL,
    delivery_minimum_order_cents = NULL, delivery_eta_min_minutes = NULL,
    delivery_eta_max_minutes = NULL, delivery_rate_per_km_cents = NULL,
    pickup_eta_min_minutes = 10, pickup_eta_max_minutes = 20, print_on_accept = 0,
    updated_at = excluded.updated_at;`,
    `DELETE FROM delivery_neighborhoods WHERE store_id = ${storeId};`,
    `DELETE FROM store_opening_periods WHERE store_id = ${storeId};`,
  );
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    statements.push(
      `INSERT INTO store_opening_periods (id, store_id, weekday, opens_at, closes_at, created_at)
  VALUES (${quote(newId())}, ${storeId}, ${weekday}, '00:00', '23:59', ${NOW});`,
    );
  }

  // Cardápio: uma Categoria e dois itens (a busca filtra um deles).
  const { category, items } = SMOKE_MENU;
  statements.push(
    `INSERT INTO menu_categories (id, store_id, name, position, available, created_at, updated_at)
  VALUES (${quote(category.id)}, ${storeId}, ${quote(category.name)}, 0, 1, ${NOW}, ${NOW})
  ON CONFLICT (id) DO UPDATE SET name = excluded.name, available = 1, updated_at = excluded.updated_at
  WHERE menu_categories.store_id = excluded.store_id;`,
  );
  for (const [position, item] of items.entries()) {
    statements.push(
      `INSERT INTO menu_items (id, store_id, category_id, name, description, price_cents, available,
    featured, image_object_key, position, created_at, updated_at)
  VALUES (${quote(item.id)}, ${storeId}, ${quote(category.id)}, ${quote(item.name)}, ${quote(item.description)},
    ${item.priceCents}, 1, 0, NULL, ${position}, ${NOW}, ${NOW})
  ON CONFLICT (id) DO UPDATE SET name = excluded.name, description = excluded.description,
    price_cents = excluded.price_cents, available = 1, category_id = excluded.category_id,
    updated_at = excluded.updated_at
  WHERE menu_items.store_id = excluded.store_id;`,
    );
  }

  // Operador só da Loja de smoke.
  statements.push(
    `INSERT INTO store_memberships (id, store_id, user_id, role, created_at)
  SELECT ${quote(newId())}, ${storeId}, u.id, 'operator', ${NOW}
  FROM users u WHERE u.email = ${quote(operator.email)}
  ON CONFLICT (store_id, user_id) DO UPDATE SET role = 'operator' WHERE store_memberships.role <> 'operator';`,
  );

  // Sessões de vida curta (o cleanup apaga). Operador com a Loja de smoke ativa; Ops sem Loja.
  const session = (email, token, activeStore) =>
    `INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent, active_store_id,
    created_at, updated_at)
  SELECT ${quote(newId())}, u.id, ${quote(token)}, ${quote(expiresAt)}, NULL, 'foode-e2e', ${activeStore},
    ${NOW}, ${NOW}
  FROM users u WHERE u.email = ${quote(email)};`;
  statements.push(
    session(operator.email, sessions.operator, storeId),
    session(ops.email, sessions.ops, "NULL"),
  );
  return `${statements.join("\n")}\n`;
}

/** Estado entregue ao Playwright (arquivo 0600; cookies mascarados no log do Actions). */
export function buildState({ sessions, secret }) {
  return {
    store: { slug: SMOKE_STORE.slug, name: SMOKE_STORE.name },
    menu: SMOKE_MENU.items.map(({ name, priceCents }) => ({ name, priceCents })),
    cookieName: SESSION_COOKIE_NAME,
    cookies: {
      operator: signSessionCookie(sessions.operator, secret),
      ops: signSessionCookie(sessions.ops, secret),
    },
  };
}

function main() {
  const [command, sqlPath, statePath] = process.argv.slice(2);
  if (command === "cleanup" && sqlPath) {
    writeFileSync(sqlPath, buildCleanupSql(), { encoding: "utf8", mode: 0o600 });
    console.log("smoke: SQL de limpeza gerado.");
    return;
  }
  if (command === "seed" && sqlPath && statePath) {
    const secret = process.env.BETTER_AUTH_SECRET;
    const sessions = { operator: randomSessionToken(), ops: randomSessionToken() };
    const state = buildState({ sessions, secret });
    if (process.env.GITHUB_ACTIONS === "true") {
      for (const value of [sessions.operator, sessions.ops, ...Object.values(state.cookies)]) {
        console.log(`::add-mask::${value}`);
      }
    }
    const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60_000).toISOString();
    writeFileSync(sqlPath, buildSeedSql({ sessions, expiresAt }), {
      encoding: "utf8",
      mode: 0o600,
    });
    writeFileSync(statePath, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    console.log(`smoke: Loja ${SMOKE_STORE.slug} e sessões (${SESSION_TTL_MINUTES} min) no SQL.`);
    return;
  }
  console.error(
    "uso: node scripts/e2e/smoke-store.mjs seed <seed.sql> <estado.json> | cleanup <cleanup.sql>",
  );
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
