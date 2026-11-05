#!/usr/bin/env node
// Verificação automatizada da configuração de produção (Ticket 30). Só LEITURA (exceto o evento
// de teste do Sentry com --sentry-ping) e NUNCA imprime valores de segredo: só nomes e estados.
//
// Confere: secrets/vars/bindings dos três Workers, Cron Trigger da api, D1 sem migration
// pendente, domínios próprios dos Workers e o redirect do www, e-mail (domínio verificado na
// MillionSend e DMARC na zona), webhooks (AbacatePay cadastrado; `/webhooks/*` respondendo) e
// Sentry (DSN nos Workers; com --sentry-ping, um evento de teste aceito por DSN).
//
// Saída: tabela ok / faltando (esperado no bloco humano) / erro, no console e no resumo do job
// ($GITHUB_STEP_SUMMARY). Sai com 1 se houver "erro", salvo com --warn-only (fim do deploy).
//
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (obrigatórios); opcionais: CLOUDFLARE_ZONE_ID,
// D1_PROD_DATABASE_ID, MILLIONSEND_API_KEY, ABACATEPAY_API_KEY, SENTRY_DSN_API/WEB/ADMIN,
// TURNSTILE_SITE_KEY, SMOKE_API_URL, EMAIL_DOMAIN.
//   node scripts/check-config.mjs [--warn-only] [--sentry-ping]
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CF_API = "https://api.cloudflare.com/client/v4";
const MS_API = "https://api.millionsend.com";
const ABACATEPAY_API = "https://api.abacatepay.com/v2";
const DOMAIN = (process.env.EMAIL_DOMAIN || "foodedelivery.com.br").trim().toLowerCase();

export const STATUS = { ok: "ok", missing: "faltando", error: "erro" };

/**
 * O que cada Worker precisa. `required` faltando = erro (o deploy já exige ou o app quebra);
 * `human` faltando = esperado até o bloco humano final (Ticket 30); `bindings` = recursos.
 */
export const WORKER_EXPECTATIONS = {
  "foode-api": {
    required: [
      "BETTER_AUTH_SECRET",
      "TURNSTILE_SECRET_KEY",
      "ORDER_TOKEN_SECRET",
      "PHONE_LOOKUP_IP_SALT",
      "MILLIONSEND_API_KEY",
    ],
    human: [
      "WHATSMIAU_API_KEY",
      "WHATSMIAU_INSTANCE_ID",
      "ABACATEPAY_API_KEY",
      "ABACATEPAY_WEBHOOK_SECRET",
      "ABACATEPAY_SIGNING_KEY",
      "ABACATEPAY_PUBLIC_KEY",
      "EFI_CLIENT_ID",
      "EFI_CLIENT_SECRET",
      "EFI_NOTIFICATION_SECRET",
      "EFI_PAYEE_CODE",
      "SENTRY_DSN",
    ],
    bindings: ["DB", "MEDIA", "BETTER_AUTH_URL", "EMAIL_FROM"],
  },
  "foode-web": { required: [], human: ["SENTRY_DSN", "SALES_WHATSAPP"], bindings: ["API"] },
  "foode-admin": { required: [], human: ["SENTRY_DSN"], bindings: ["API"] },
};

export const CUSTOM_DOMAINS = {
  [DOMAIN]: "foode-web",
  [`admin.${DOMAIN}`]: "foode-admin",
  [`api.${DOMAIN}`]: "foode-api",
};

const row = (area, item, status, detail = "") => ({ area, item, status, detail });

/** Linhas de um Worker a partir dos nomes dos bindings publicados (nunca dos valores). */
export function workerRows(worker, bindingNames) {
  const names = new Set(bindingNames);
  const expected = WORKER_EXPECTATIONS[worker];
  const rows = [];
  for (const name of expected.required) {
    rows.push(
      row(
        `Worker ${worker}`,
        name,
        names.has(name) ? STATUS.ok : STATUS.error,
        names.has(name) ? "" : "obrigatório",
      ),
    );
  }
  for (const name of expected.human) {
    rows.push(
      row(
        `Worker ${worker}`,
        name,
        names.has(name) ? STATUS.ok : STATUS.missing,
        names.has(name) ? "" : "bloco humano",
      ),
    );
  }
  for (const name of expected.bindings) {
    rows.push(
      row(`Worker ${worker}`, `binding ${name}`, names.has(name) ? STATUS.ok : STATUS.error),
    );
  }
  return rows;
}

/** `triggers.crons` do wrangler.jsonc (lido por regex: o JSONC tem URLs com `//`). */
export function configuredCrons(wranglerText) {
  const match = /"crons"\s*:\s*\[([^\]]*)\]/u.exec(wranglerText);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
}

export function cronRow(expected, deployed) {
  const item = "Cron Trigger (foode-api)";
  if (expected.length === 0 && deployed.length === 0) {
    return row("Cron", item, STATUS.missing, "sem triggers.crons na master (Ticket 15)");
  }
  const missing = expected.filter((cron) => !deployed.includes(cron));
  if (missing.length > 0) {
    return row("Cron", item, STATUS.error, `não publicado: ${missing.join(", ")}`);
  }
  return row("Cron", item, STATUS.ok, deployed.join(", "));
}

export function migrationRow(localNames, appliedNames) {
  const applied = new Set(appliedNames);
  const pending = localNames.filter((name) => !applied.has(name));
  if (pending.length > 0) {
    return row(
      "D1",
      "migrations (foode-prod)",
      STATUS.error,
      `pendentes: ${pending.join(", ")} (rode o db-migrate)`,
    );
  }
  return row("D1", "migrations (foode-prod)", STATUS.ok, `${appliedNames.length} aplicadas`);
}

export function domainRows(domains) {
  return Object.entries(CUSTOM_DOMAINS).map(([hostname, service]) => {
    const found = domains.find((d) => d.hostname === hostname);
    if (!found) return row("DNS", hostname, STATUS.error, `sem custom domain → ${service}`);
    if (found.service !== service) {
      return row(
        "DNS",
        hostname,
        STATUS.error,
        `aponta para ${found.service}, esperado ${service}`,
      );
    }
    return row("DNS", hostname, STATUS.ok, service);
  });
}

/** Sonda sem segredo em `/webhooks/*`: 503 = Worker sem as chaves; 401/400 = responde e recusa. */
export function webhookProbeRow(name, status) {
  if (status === 503)
    return row("Webhooks", `${name} (endpoint)`, STATUS.missing, "Worker sem as chaves (503)");
  if (status === 401 || status === 400 || status === 403) {
    return row("Webhooks", `${name} (endpoint)`, STATUS.ok, `recusa sem segredo (${status})`);
  }
  return row("Webhooks", `${name} (endpoint)`, STATUS.error, `HTTP ${status}`);
}

/** DSN → endpoint de envelope e chave pública; null se o formato não bater. Nunca impresso. */
export function parseDsn(dsn) {
  try {
    const url = new URL(dsn.trim());
    const projectId = url.pathname.replace(/^\/+|\/+$/gu, "");
    if (!url.username || !/^\d+$/u.test(projectId)) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

export function renderTable(rows) {
  const icon = { ok: "ok", faltando: "faltando", erro: "**erro**" };
  const lines = [
    "| Área | Item | Estado | Detalhe |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) => `| ${r.area} | ${r.item} | ${icon[r.status]} | ${r.detail.replaceAll("|", "/")} |`,
    ),
  ];
  const count = (status) => rows.filter((r) => r.status === status).length;
  lines.push(
    "",
    `**${count(STATUS.ok)} ok · ${count(STATUS.missing)} faltando (bloco humano) · ${count(STATUS.error)} erro**`,
  );
  return lines.join("\n");
}

// ---- rede ----

async function getJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const json = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, json };
}

function cfClient(token, account) {
  return async (method, path, body) => {
    const result = await getJson(`${CF_API}${path.replace(":account", account)}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!result.ok || !result.json?.success) {
      const errors = (result.json?.errors ?? []).map((e) => `${e.code}`).join(",");
      throw new Error(
        `Cloudflare ${path.split("?")[0].replace(account, ":account")}: HTTP ${result.status} ${errors}`,
      );
    }
    return result.json.result;
  };
}

async function guarded(area, item, check) {
  try {
    const result = await check();
    return Array.isArray(result) ? result : [result];
  } catch (error) {
    return [row(area, item, STATUS.error, error instanceof Error ? error.message : String(error))];
  }
}

function localMigrations() {
  return readdirSync(`${ROOT}packages/db/migrations`)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
}

function wranglerText() {
  return readFileSync(`${ROOT}apps/api/wrangler.jsonc`, "utf8");
}

function databaseId(text) {
  return (
    process.env.D1_PROD_DATABASE_ID?.trim() || /"database_id"\s*:\s*"([^"]+)"/u.exec(text)?.[1]
  );
}

async function sentryPing(label, dsn) {
  const target = parseDsn(dsn);
  if (!target)
    return row("Sentry", `evento de teste (${label})`, STATUS.error, "DSN em formato inesperado");
  const eventId = randomUUID().replaceAll("-", "");
  const now = new Date().toISOString();
  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: now }),
    JSON.stringify({ type: "event" }),
    JSON.stringify({
      event_id: eventId,
      timestamp: now,
      level: "info",
      platform: "javascript",
      environment: "production",
      message: `check-config: evento de teste (${label})`,
      tags: { source: "check-config" },
    }),
  ].join("\n");
  const response = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-sentry-envelope",
      "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${target.publicKey}, sentry_client=foode-check-config/1.0`,
    },
    body: envelope,
    signal: AbortSignal.timeout(20_000),
  });
  return response.ok
    ? row("Sentry", `evento de teste (${label})`, STATUS.ok, "aceito pelo Sentry")
    : row("Sentry", `evento de teste (${label})`, STATUS.error, `HTTP ${response.status}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const warnOnly = args.has("--warn-only");
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !account) {
    console.error("check-config: defina CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID.");
    process.exit(warnOnly ? 0 : 1);
  }
  const cf = cfClient(token, account);
  const apiUrl = (process.env.SMOKE_API_URL || `https://api.${DOMAIN}`).replace(/\/+$/u, "");
  const wrangler = wranglerText();
  const rows = [];

  // Workers: nomes dos bindings publicados (secret_text, plain_text, d1, r2, service...).
  for (const worker of Object.keys(WORKER_EXPECTATIONS)) {
    rows.push(
      ...(await guarded(`Worker ${worker}`, "settings", async () => {
        const settings = await cf("GET", `/accounts/:account/workers/scripts/${worker}/settings`);
        return workerRows(
          worker,
          (settings.bindings ?? []).map((b) => b.name),
        );
      })),
    );
  }

  rows.push(
    ...(await guarded("Cron", "Cron Trigger (foode-api)", async () => {
      const result = await cf("GET", "/accounts/:account/workers/scripts/foode-api/schedules");
      return cronRow(
        configuredCrons(wrangler),
        (result.schedules ?? []).map((s) => s.cron),
      );
    })),
  );

  rows.push(
    ...(await guarded("D1", "migrations (foode-prod)", async () => {
      const id = databaseId(wrangler);
      if (!id) throw new Error("sem D1_PROD_DATABASE_ID nem database_id no wrangler.jsonc");
      const result = await cf("POST", `/accounts/:account/d1/database/${id}/query`, {
        sql: "SELECT name FROM d1_migrations ORDER BY id",
      });
      const applied = (result?.[0]?.results ?? []).map((r) => r.name);
      return migrationRow(localMigrations(), applied);
    })),
  );

  rows.push(
    ...(await guarded("DNS", "custom domains", async () => {
      const domains = await cf("GET", "/accounts/:account/workers/domains");
      return domainRows(domains ?? []);
    })),
    ...(await guarded("DNS", `www.${DOMAIN} → apex`, async () => {
      const response = await fetch(`https://www.${DOMAIN}/precos?check=1`, {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const location = response.headers.get("location") ?? "";
      const ok = response.status === 301 && location.startsWith(`https://${DOMAIN}/precos`);
      return row(
        "DNS",
        `www.${DOMAIN} → apex`,
        ok ? STATUS.ok : STATUS.error,
        `HTTP ${response.status}`,
      );
    })),
  );

  // E-mail: domínio na MillionSend (DKIM/SPF verificados) e DMARC publicado na zona.
  const msKey = process.env.MILLIONSEND_API_KEY?.trim();
  rows.push(
    ...(await guarded("E-mail", `MillionSend ${DOMAIN}`, async () => {
      if (!msKey)
        return row(
          "E-mail",
          `MillionSend ${DOMAIN}`,
          STATUS.error,
          "sem MILLIONSEND_API_KEY no GitHub",
        );
      const list = await getJson(`${MS_API}/domains?limit=100`, {
        headers: { authorization: `Bearer ${msKey}` },
      });
      if (!list.ok) throw new Error(`MillionSend: HTTP ${list.status}`);
      const domain = (list.json?.data ?? []).find(
        (d) => d.name?.toLowerCase() === DOMAIN && !d.shared,
      );
      if (!domain)
        return row(
          "E-mail",
          `MillionSend ${DOMAIN}`,
          STATUS.error,
          "domínio não cadastrado (setup-email-dominio)",
        );
      const detail = await getJson(`${MS_API}/domains/${domain.id}`, {
        headers: { authorization: `Bearer ${msKey}` },
      });
      const gating = (detail.json?.records ?? []).filter(
        (r) => r.record === "DKIM" || r.record === "SPF",
      );
      const verified = gating.length > 0 && gating.every((r) => r.status === "verified");
      return row(
        "E-mail",
        `MillionSend ${DOMAIN}`,
        verified ? STATUS.ok : STATUS.error,
        gating.map((r) => `${r.record} ${r.status}`).join(", ") || `status ${domain.status}`,
      );
    })),
  );
  const zone = process.env.CLOUDFLARE_ZONE_ID?.trim();
  rows.push(
    ...(await guarded("E-mail", "DMARC", async () => {
      if (!zone) return row("E-mail", "DMARC", STATUS.missing, "sem CLOUDFLARE_ZONE_ID");
      const query = new URLSearchParams({ "name.exact": `_dmarc.${DOMAIN}`, type: "TXT" });
      const records = await cf("GET", `/zones/${zone}/dns_records?${query}`);
      const has = (records ?? []).some((r) => String(r.content).includes("v=DMARC1"));
      return row("E-mail", "DMARC", has ? STATUS.ok : STATUS.error, has ? "" : "sem TXT v=DMARC1");
    })),
  );

  // Webhooks: cadastro na AbacatePay (com a chave do GitHub) e sondas sem segredo.
  const abacateKey = process.env.ABACATEPAY_API_KEY?.trim();
  rows.push(
    ...(await guarded("Webhooks", "AbacatePay (cadastro)", async () => {
      if (!abacateKey)
        return row("Webhooks", "AbacatePay (cadastro)", STATUS.missing, "bloco humano (sem chave)");
      const query = new URLSearchParams({ limit: "100", search: "webhooks/abacatepay" });
      const list = await getJson(`${ABACATEPAY_API}/webhooks/list?${query}`, {
        headers: { authorization: `Bearer ${abacateKey}`, accept: "application/json" },
      });
      if (!list.ok) throw new Error(`AbacatePay: HTTP ${list.status}`);
      const target = `${apiUrl}/webhooks/abacatepay`;
      const hook = (list.json?.data ?? []).find((h) => {
        try {
          const url = new URL(h.endpoint);
          return `${url.origin}${url.pathname}` === target;
        } catch {
          return false;
        }
      });
      return hook
        ? row("Webhooks", "AbacatePay (cadastro)", STATUS.ok, `devMode=${hook.devMode}`)
        : row(
            "Webhooks",
            "AbacatePay (cadastro)",
            STATUS.error,
            "não cadastrado (setup-abacatepay-webhook)",
          );
    })),
  );
  for (const name of ["abacatepay", "efi"]) {
    rows.push(
      ...(await guarded("Webhooks", `${name} (endpoint)`, async () => {
        const response = await fetch(`${apiUrl}/webhooks/${name}`, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "foode-check-config" },
          body: "{}",
          signal: AbortSignal.timeout(20_000),
        });
        return webhookProbeRow(name, response.status);
      })),
    );
  }

  // Sentry: DSN no GitHub (o deploy sincroniza) e, com --sentry-ping, evento de teste aceito.
  for (const [label, envName] of [
    ["api", "SENTRY_DSN_API"],
    ["web", "SENTRY_DSN_WEB"],
    ["admin", "SENTRY_DSN_ADMIN"],
  ]) {
    const dsn = process.env[envName]?.trim();
    if (!dsn) {
      rows.push(row("Sentry", `DSN ${label}`, STATUS.missing, "bloco humano"));
      continue;
    }
    if (args.has("--sentry-ping")) {
      rows.push(
        ...(await guarded("Sentry", `evento de teste (${label})`, () => sentryPing(label, dsn))),
      );
    } else {
      rows.push(
        row("Sentry", `DSN ${label}`, STATUS.ok, "presente (--sentry-ping envia um evento)"),
      );
    }
  }

  rows.push(
    row(
      "Turnstile",
      "TURNSTILE_SITE_KEY (variable)",
      process.env.TURNSTILE_SITE_KEY?.trim() ? STATUS.ok : STATUS.error,
    ),
  );

  const table = renderTable(rows);
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Verificação de configuração\n\n${table}\n`,
    );
  }
  const errors = rows.filter((r) => r.status === STATUS.error).length;
  if (errors > 0) {
    console.log(`::${warnOnly ? "warning" : "error"}::check-config: ${errors} item(ns) com erro`);
    if (!warnOnly) process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
