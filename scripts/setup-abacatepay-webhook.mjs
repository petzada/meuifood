#!/usr/bin/env node
// Cadastra o webhook da AbacatePay do Foode (Ticket 26). Roda no workflow manual
// setup-abacatepay-webhook.yml DEPOIS que o Dono criar a chave (permissões WEBHOOK:CREATE e
// WEBHOOK:READ) e os secrets. Idempotente: procura pelo endpoint em `GET /webhooks/list` e só cria
// (`POST /webhooks/create`) se não houver um com os eventos necessários. O webhook herda o
// ambiente da chave (produção ou Dev mode).
//
// Env: ABACATEPAY_API_KEY, ABACATEPAY_WEBHOOK_SECRET (o mesmo secret do Worker: a AbacatePay o
// manda em `?webhookSecret=`). Opcional: WEBHOOK_ENDPOINT (padrão
// https://api.foodedelivery.com.br/webhooks/abacatepay).
// Nunca imprime a chave, o segredo nem a URL com o segredo: só nome, id e eventos.

const API = "https://api.abacatepay.com/v2";
const NAME = "foode-api";
const EVENTS = [
  "transparent.completed",
  "transparent.refunded",
  "transparent.disputed",
  "transparent.lost",
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`setup-abacatepay-webhook: variável ${name} ausente.`);
    process.exit(1);
  }
  return value;
}

const KEY = required("ABACATEPAY_API_KEY");
const SECRET = required("ABACATEPAY_WEBHOOK_SECRET");
const ENDPOINT = (
  process.env.WEBHOOK_ENDPOINT || "https://api.foodedelivery.com.br/webhooks/abacatepay"
).trim();

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success === false) {
    const code = typeof json?.error === "string" ? json.error.slice(0, 120) : "";
    throw new Error(`${method} ${path.split("?")[0]} → HTTP ${response.status} ${code}`);
  }
  return json;
}

/** Endpoint sem query: a AbacatePay acrescenta `?webhookSecret=` na entrega. */
function sameEndpoint(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}` === ENDPOINT;
  } catch {
    return false;
  }
}

async function existing() {
  const found = [];
  let after = null;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: "100", search: "webhooks/abacatepay" });
    if (after) query.set("after", after);
    const json = await call("GET", `/webhooks/list?${query}`);
    found.push(...(json.data ?? []).filter((hook) => sameEndpoint(hook.endpoint)));
    after = json.pagination?.hasMore ? json.pagination.next : null;
    if (!after) break;
  }
  return found;
}

const hooks = await existing();
const complete = hooks.find((hook) => EVENTS.every((event) => hook.events?.includes(event)));
if (complete) {
  console.log(
    `Webhook já cadastrado: ${complete.name} (${complete.id}), devMode=${complete.devMode}, eventos: ${complete.events.join(", ")}.`,
  );
  process.exit(0);
}
if (hooks.length > 0) {
  console.error(
    `Há ${hooks.length} webhook(s) neste endpoint sem todos os eventos (${hooks.map((h) => h.id).join(", ")}). ` +
      "Remova-o(s) no painel da AbacatePay e rode de novo (não crio duplicata).",
  );
  process.exit(1);
}
const created = await call("POST", "/webhooks/create", {
  name: NAME,
  endpoint: ENDPOINT,
  secret: SECRET,
  events: EVENTS,
});
console.log(
  `Webhook criado: ${created.data?.name ?? NAME} (${created.data?.id ?? "?"}), devMode=${created.data?.devMode}.`,
);
