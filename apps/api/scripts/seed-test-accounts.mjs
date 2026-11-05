// Contas de teste em produção (workflow `contas-de-teste.yml`, manual): `lojista@teste.com`
// (Dono) e `operador@teste.com` (Operador) com e-mail verificado e conta `credential` do Better
// Auth, e a "Loja Piloto" (`loja-piloto`) em `onboarding` com perfil mínimo fictício. Idempotente:
// rodar de novo só troca a senha (hash novo) e não duplica Loja, membership nem auditoria.
//
// A senha vem de SEED_TEST_PASSWORD e NUNCA é impressa nem gravada: só o hash entra no SQL, no
// mesmo formato que o Better Auth da api grava (`hashPassword` de `better-auth/crypto`, scrypt
// N=16384 r=16 p=1, `salt:hash` em hex) — a conta `credential` usa `account_id = user_id`, como
// o próprio Better Auth faz no reset/sign-up. Mesmas regras do @foode/db: Loja nova + perfil +
// auditoria `store.created`; memberships pelo e-mail com `ON CONFLICT DO NOTHING` e auditoria
// condicionada à linha criada nesta execução (como `provisionMembership`).
//
// Uso (CI): SEED_TEST_PASSWORD=... node scripts/seed-test-accounts.mjs <saida.sql>
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const TEST_ACCOUNTS = [
  { email: "lojista@teste.com", name: "Lojista Teste", role: "owner" },
  { email: "operador@teste.com", name: "Operador Teste", role: "operator" },
];

export const PILOT_STORE = { slug: "loja-piloto", name: "Loja Piloto" };

/** Perfil mínimo fictício (CNPJ/CPF de exemplo com dígito verificador válido). */
export const PILOT_PROFILE = {
  cnpj: "11222333000181",
  whatsapp: "5511900000000",
  postalCode: "01310100",
  street: "Avenida Paulista",
  number: "1000",
  district: "Bela Vista",
  city: "São Paulo",
  state: "SP",
  pixKeyType: "random",
  pixKey: "loja-piloto-chave-de-teste",
  holderName: "Loja Piloto (teste)",
  holderDocument: "11222333000181",
};

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{128}$/u;
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** Literal SQL com aspas simples escapadas (defesa extra: os valores já são fixos ou hex). */
export function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    throw new Error(`SEED_TEST_PASSWORD ausente ou com menos de ${PASSWORD_MIN} caracteres`);
  }
  if (password.length > PASSWORD_MAX) {
    throw new Error(`SEED_TEST_PASSWORD com mais de ${PASSWORD_MAX} caracteres`);
  }
  return password;
}

/**
 * SQL idempotente para `wrangler d1 execute --file`. `passwordHashes` = `{ email: hash }` já no
 * formato do Better Auth; `newId` injetável para teste.
 */
export function buildTestAccountsSql(passwordHashes, newId = () => crypto.randomUUID()) {
  for (const account of TEST_ACCOUNTS) {
    if (!HASH_PATTERN.test(passwordHashes[account.email] ?? "")) {
      throw new Error(`hash de senha inválido para ${account.email}`);
    }
  }
  const storeId = newId();
  const p = PILOT_PROFILE;
  const slug = quote(PILOT_STORE.slug);
  const statements = [];

  for (const account of TEST_ACCOUNTS) {
    const email = quote(account.email);
    statements.push(
      `INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
  VALUES (${quote(newId())}, ${email}, ${quote(account.name)}, 1, ${NOW}, ${NOW})
  ON CONFLICT (email) DO UPDATE SET email_verified = 1, updated_at = ${NOW}
  WHERE users.email_verified IS NOT 1;`,
      `INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
  SELECT ${quote(newId())}, u.id, u.id, 'credential', ${quote(passwordHashes[account.email])}, ${NOW}, ${NOW}
  FROM users u WHERE u.email = ${email}
  ON CONFLICT (provider_id, account_id) DO UPDATE SET password = excluded.password, updated_at = excluded.updated_at;`,
      `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
  SELECT ${quote(newId())}, ${NOW}, NULL, NULL, 'auth.password_set', 'user', u.id, json_object('source', 'contas-de-teste')
  FROM users u WHERE u.email = ${email};`,
    );
  }

  // Loja Piloto: só nasce se o Link personalizado estiver livre (atual e histórico, decisão 69).
  statements.push(
    `INSERT INTO stores (id, slug, name, status, created_at, updated_at)
  SELECT ${quote(storeId)}, ${slug}, ${quote(PILOT_STORE.name)}, 'onboarding', ${NOW}, ${NOW}
  WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = ${slug})
    AND NOT EXISTS (SELECT 1 FROM store_slug_history WHERE slug = ${slug});`,
    `INSERT INTO store_profiles (store_id, cnpj, whatsapp, address_postal_code, address_street,
    address_number, address_complement, address_district, address_city, address_state,
    payout_pix_key_type, payout_pix_key, payout_holder_name, payout_holder_document, card_mode,
    created_at, updated_at)
  SELECT s.id, ${quote(p.cnpj)}, ${quote(p.whatsapp)}, ${quote(p.postalCode)}, ${quote(p.street)},
    ${quote(p.number)}, NULL, ${quote(p.district)}, ${quote(p.city)}, ${quote(p.state)},
    ${quote(p.pixKeyType)}, ${quote(p.pixKey)}, ${quote(p.holderName)}, ${quote(p.holderDocument)}, NULL,
    ${NOW}, ${NOW}
  FROM stores s WHERE s.id = ${quote(storeId)}
  ON CONFLICT (store_id) DO NOTHING;`,
    `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
  SELECT ${quote(newId())}, ${NOW}, NULL, s.id, 'store.created', 'store', s.id,
    json_object('before', NULL, 'after', json_object('slug', s.slug, 'name', s.name, 'status', s.status),
      'source', 'contas-de-teste')
  FROM stores s WHERE s.id = ${quote(storeId)};`,
  );

  for (const account of TEST_ACCOUNTS) {
    const membershipId = newId();
    statements.push(
      `INSERT INTO store_memberships (id, store_id, user_id, role, created_at)
  SELECT ${quote(membershipId)}, s.id, u.id, ${quote(account.role)}, ${NOW}
  FROM stores s JOIN users u ON u.email = ${quote(account.email)} WHERE s.slug = ${slug}
  ON CONFLICT (store_id, user_id) DO NOTHING;`,
      `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
  SELECT ${quote(newId())}, ${NOW}, NULL, store_id, 'membership.test_account_seeded', 'store_membership', id,
    json_object('role', role, 'userId', user_id, 'source', 'contas-de-teste')
  FROM store_memberships WHERE id = ${quote(membershipId)};`,
    );
  }
  return `${statements.join("\n")}\n`;
}

async function main() {
  const output = process.argv[2];
  if (!output) {
    console.error("uso: node scripts/seed-test-accounts.mjs <saida.sql>");
    process.exit(2);
  }
  const password = validatePassword(process.env.SEED_TEST_PASSWORD);
  const { hashPassword, verifyPassword } = await import("better-auth/crypto");
  const hashes = {};
  for (const account of TEST_ACCOUNTS) {
    const hash = await hashPassword(password);
    if (!(await verifyPassword({ hash, password }))) throw new Error("hash não confere");
    hashes[account.email] = hash;
  }
  writeFileSync(output, buildTestAccountsSql(hashes), { encoding: "utf8", mode: 0o600 });
  console.log(`contas de teste: ${TEST_ACCOUNTS.length} usuário(s) e a Loja Piloto no SQL gerado.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
