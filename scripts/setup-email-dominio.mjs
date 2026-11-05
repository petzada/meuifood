#!/usr/bin/env node
// Domínio de e-mail na MillionSend + DNS na Cloudflare, sem passo humano (Ticket 25).
// Roda no workflow setup-email-dominio.yml (workflow_dispatch). Idempotente: pode rodar de novo.
//
// 1. Acha o domínio na MillionSend (GET /domains) ou cadastra (POST /domains, região fixa na
//    criação: sa-east-1 por padrão — pesquisa-integracoes §2);
// 2. lê os registros exigidos (GET /domains/{id}: DKIM, SPF = MX + TXT do MAIL FROM, DMARC,
//    Tracking) e cria/atualiza cada um na zona da Cloudflare, sempre "DNS only" (proxied: false);
// 3. dispara a verificação (POST /domains/{id}/verify) e consulta até DKIM e SPF ficarem
//    `verified`; falha (exit 1) se não verificar no prazo.
//
// Env: MILLIONSEND_API_KEY, CLOUDFLARE_API_TOKEN (DNS edit na zona), CLOUDFLARE_ZONE_ID.
// Opcionais: EMAIL_DOMAIN (foodedelivery.com.br), MILLIONSEND_REGION (sa-east-1),
// TRACKING_SUBDOMAIN (tracking; vazio = sem CNAME de tracking), VERIFY_TIMEOUT_MIN (15).
// Nunca imprime a chave nem os valores dos registros: só tipo, nome e status.

const MS_API = "https://api.millionsend.com";
const CF_API = "https://api.cloudflare.com/client/v4";

const MS_KEY = required("MILLIONSEND_API_KEY");
const CF_TOKEN = required("CLOUDFLARE_API_TOKEN");
const ZONE_ID = required("CLOUDFLARE_ZONE_ID");
const DOMAIN = (process.env.EMAIL_DOMAIN || "foodedelivery.com.br").trim().toLowerCase();
const REGION = (process.env.MILLIONSEND_REGION || "sa-east-1").trim();
const TRACKING = (process.env.TRACKING_SUBDOMAIN ?? "tracking").trim();
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MIN || 15) * 60_000;
const POLL_MS = 30_000;
/** Só DKIM e SPF bloqueiam o envio (doc MillionSend); DMARC e Tracking são informativos. */
const GATING = new Set(["DKIM", "SPF"]);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`::error::${name} ausente`);
    process.exit(1);
  }
  return value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ms(method, path, body) {
  const response = await fetch(`${MS_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${MS_KEY}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // corpo não-JSON: segue só com o status
  }
  return { status: response.status, ok: response.ok, json };
}

function msError(step, result) {
  const message = result.json?.message ?? result.json?.error ?? result.json?.name ?? "";
  return new Error(`MillionSend ${step}: HTTP ${result.status}${message ? ` (${message})` : ""}`);
}

async function cf(method, path, body) {
  const response = await fetch(`${CF_API}${path}`, {
    method,
    headers: { authorization: `Bearer ${CF_TOKEN}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    const errors = (json?.errors ?? []).map((e) => `${e.code} ${e.message}`).join("; ");
    throw new Error(
      `Cloudflare ${method} ${path.split("?")[0]}: HTTP ${response.status} ${errors}`,
    );
  }
  return json.result;
}

async function findDomain() {
  let after;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: "100", ...(after ? { after } : {}) });
    const result = await ms("GET", `/domains?${query}`);
    if (!result.ok) throw msError("listar domínios", result);
    const data = result.json?.data ?? [];
    const found = data.find((d) => d.name?.toLowerCase() === DOMAIN && !d.shared);
    if (found) return found;
    if (!result.json?.has_more || data.length === 0) return null;
    after = data.at(-1).id;
  }
  return null;
}

async function ensureDomain() {
  const existing = await findDomain();
  if (existing) {
    console.log(
      `domínio ${DOMAIN} já cadastrado (região ${existing.region}, status ${existing.status})`,
    );
    if (existing.region !== REGION) {
      console.log(
        `::warning::região ${existing.region} difere da pedida (${REGION}); a região é fixa na criação, seguimos com a existente`,
      );
    }
    return existing.id;
  }
  const body = { name: DOMAIN, region: REGION, open_tracking: false, click_tracking: false };
  if (TRACKING) body.tracking_subdomain = TRACKING;
  const created = await ms("POST", "/domains", body);
  if (!created.ok) throw msError("cadastrar domínio", created);
  console.log(`domínio ${DOMAIN} cadastrado na MillionSend (região ${REGION})`);
  return created.json.id;
}

async function getDomain(id) {
  const result = await ms("GET", `/domains/${id}`);
  if (!result.ok) throw msError("ler domínio", result);
  return result.json;
}

/** Nome absoluto do registro na zona (a MillionSend pode devolver relativo ou FQDN). */
function fqdn(name) {
  const clean = String(name ?? "")
    .trim()
    .replace(/\.$/u, "")
    .toLowerCase();
  if (!clean || clean === "@") return DOMAIN;
  if (clean === DOMAIN || clean.endsWith(`.${DOMAIN}`)) return clean;
  return `${clean}.${DOMAIN}`;
}

const unquote = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^"(.*)"$/su, "$1")
    .replace(/"\s+"/gu, "");
/** Família do TXT para não sobrescrever outro TXT no mesmo nome (ex.: SPF x verificação de terceiros). */
const txtFamily = (value) =>
  unquote(value)
    .match(/^v=(spf1|dmarc1|dkim1)/iu)?.[1]
    ?.toLowerCase() ?? "outro";

async function upsertRecord(record) {
  const type = String(record.type).toUpperCase();
  const name = fqdn(record.name);
  const wanted = {
    type,
    name,
    content:
      type === "TXT"
        ? `"${unquote(record.value)}"`
        : String(record.value).trim().replace(/\.$/u, ""),
    ttl: 1,
    proxied: false,
    comment: `MillionSend ${record.record} (setup-email-dominio)`,
  };
  if (type === "MX") wanted.priority = Number(record.priority ?? 10);
  if (!["MX", "TXT", "CNAME"].includes(type)) delete wanted.proxied;

  const query = new URLSearchParams({ "name.exact": name, type, per_page: "100" });
  let candidates = await cf("GET", `/zones/${ZONE_ID}/dns_records?${query}`);
  if (type === "TXT")
    candidates = candidates.filter((r) => txtFamily(r.content) === txtFamily(record.value));
  // CNAME é exclusivo no nome: qualquer outro tipo ali impediria a criação.
  if (type === "CNAME") {
    const others = await cf(
      "GET",
      `/zones/${ZONE_ID}/dns_records?${new URLSearchParams({ "name.exact": name, per_page: "100" })}`,
    );
    const blocking = others.filter((r) => r.type !== "CNAME");
    if (blocking.length)
      throw new Error(
        `${name}: já há registro ${blocking.map((r) => r.type).join(",")} no nome do CNAME`,
      );
  }

  const same = (r) =>
    (type === "TXT"
      ? unquote(r.content) === unquote(wanted.content)
      : r.content.toLowerCase() === wanted.content.toLowerCase()) &&
    (type !== "MX" || r.priority === wanted.priority) &&
    r.proxied !== true;

  const label = `${record.record.padEnd(8)} ${type.padEnd(5)} ${name}`;
  if (candidates.some(same)) {
    console.log(`=  ${label} (já correto)`);
    return;
  }
  if (candidates.length > 0) {
    // MX do MAIL FROM pode ter mais de um valor? Atualiza o primeiro e mantém o resto intocado.
    await cf("PUT", `/zones/${ZONE_ID}/dns_records/${candidates[0].id}`, wanted);
    console.log(`~  ${label} (atualizado)`);
    return;
  }
  await cf("POST", `/zones/${ZONE_ID}/dns_records`, wanted);
  console.log(`+  ${label} (criado)`);
}

function report(domain) {
  for (const r of domain.records ?? []) {
    console.log(
      `   ${String(r.record).padEnd(8)} ${String(r.type).padEnd(5)} ${fqdn(r.name)}: ${r.status}${r.live ? ` (dns ${r.live})` : ""}`,
    );
  }
}

const gatingVerified = (domain) => {
  const rows = (domain.records ?? []).filter((r) => GATING.has(r.record));
  return rows.length > 0 && rows.every((r) => r.status === "verified");
};

async function main() {
  const id = await ensureDomain();
  let domain = await getDomain(id);
  const records = domain.records ?? [];
  if (records.length === 0)
    throw new Error("MillionSend não devolveu registros DNS para o domínio");

  console.log(`registros exigidos (${records.length}) → zona Cloudflare (DNS only):`);
  for (const record of records) {
    if (record.record === "Receiving") continue; // recebimento não é usado (só envio)
    await upsertRecord(record);
  }

  const deadline = Date.now() + TIMEOUT_MS;
  for (let attempt = 1; ; attempt += 1) {
    const verify = await ms("POST", `/domains/${id}/verify`);
    if (!verify.ok && verify.status !== 429) throw msError("verificar domínio", verify);
    domain = verify.ok ? verify.json : await getDomain(id);
    console.log(`verificação #${attempt}: domínio ${domain.status}`);
    report(domain);
    if (gatingVerified(domain)) break;
    if (Date.now() + POLL_MS > deadline) {
      throw new Error(
        `DKIM/SPF não verificaram em ${TIMEOUT_MS / 60_000} min (DNS pode estar propagando: rode de novo)`,
      );
    }
    await sleep(POLL_MS);
  }

  const summary = process.env.GITHUB_STEP_SUMMARY;
  const lines = [
    `### E-mail: ${DOMAIN} verificado na MillionSend`,
    "",
    `Região \`${domain.region}\`; remetente \`nao-responda@${DOMAIN}\` liberado (DKIM e SPF verificados).`,
    "",
    "| Registro | Tipo | Nome | Status |",
    "|---|---|---|---|",
    ...(domain.records ?? []).map(
      (r) => `| ${r.record} | ${r.type} | ${fqdn(r.name)} | ${r.status} |`,
    ),
  ];
  if (summary) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(summary, `${lines.join("\n")}\n`);
  }
  console.log(`ok: ${DOMAIN} verificado (DKIM e SPF).`);
}

main().catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
