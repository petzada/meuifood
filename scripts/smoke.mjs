#!/usr/bin/env node
// Smoke pós-deploy (deploy.yml) e `pnpm e2e`: /health da api, Storefront, /privacidade, login
// do Painel, guarda do `/ops` (sem sessão → /entrar) e os dois service bindings (web → api fetch,
// admin → api RPC). Só leitura: não cria nem altera dados de produção.
// URLs: SMOKE_API_URL / SMOKE_WEB_URL / SMOKE_ADMIN_URL (GitHub variables). Sem elas, usa
// os workers.dev da conta (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN). O deploy.yml roda
// primeiro nos domínios próprios (Ticket 25) e depois no workers.dev (fallback).

const WORKERS = { api: "foode-api", web: "foode-web", admin: "foode-admin" };
const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS ?? 6);
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS ?? 5000);

async function workersDevSubdomain() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) {
    throw new Error("defina SMOKE_*_URL ou CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN");
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const body = await response.json();
  if (!response.ok || !body?.result?.subdomain) {
    throw new Error(`subdomínio workers.dev indisponível (HTTP ${response.status})`);
  }
  return body.result.subdomain;
}

async function resolveUrls() {
  const fromEnv = {
    api: process.env.SMOKE_API_URL,
    web: process.env.SMOKE_WEB_URL,
    admin: process.env.SMOKE_ADMIN_URL,
  };
  if (Object.values(fromEnv).every(Boolean)) return fromEnv;
  const subdomain = await workersDevSubdomain();
  return Object.fromEntries(
    Object.entries(WORKERS).map(([key, worker]) => [
      key,
      fromEnv[key] || `https://${worker}.${subdomain}.workers.dev`,
    ]),
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function check(name, url, assert) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "foode-smoke" },
      });
      const text = await response.text();
      await assert(response, text);
      console.log(`ok   ${name} (${response.status})`);
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(DELAY_MS);
    }
  }
  console.error(`FALHA ${name}: ${lastError?.message ?? lastError}`);
  return false;
}

function expectStatus(response, status) {
  if (response.status !== status) throw new Error(`HTTP ${response.status}, esperado ${status}`);
}

function expectJsonOk(text) {
  const body = JSON.parse(text);
  if (body.status !== "ok") throw new Error(`status ${body.status}`);
}

const urls = await resolveUrls();
console.log(`smoke: api=${urls.api} web=${urls.web} admin=${urls.admin}`);

const results = [
  await check("api /health", `${urls.api}/health`, (response, text) => {
    expectStatus(response, 200);
    expectJsonOk(text);
  }),
  await check("api não expõe o Painel no fetch público", `${urls.api}/painel/health`, (response) =>
    expectStatus(response, 404),
  ),
  await check("Storefront /", `${urls.web}/`, (response, text) => {
    expectStatus(response, 200);
    if (!text.includes("Foode")) throw new Error("página sem a marca Foode");
  }),
  await check("Storefront → api (service binding)", `${urls.web}/api/health`, (response, text) => {
    expectStatus(response, 200);
    expectJsonOk(text);
  }),
  await check("Painel /entrar (login)", `${urls.admin}/entrar`, (response, text) => {
    expectStatus(response, 200);
    if (!text.includes("Painel Foode")) throw new Error("página de login sem o título do Painel");
  }),
  await check("Storefront /privacidade", `${urls.web}/privacidade`, (response) =>
    expectStatus(response, 200),
  ),
  await check("Painel /ops exige sessão", `${urls.admin}/ops`, (response) => {
    if (response.status < 300 || response.status >= 400) {
      throw new Error(`HTTP ${response.status}, esperado redirecionamento`);
    }
    const location = response.headers.get("location") ?? "";
    if (!location.includes("/entrar")) throw new Error(`redireciona para ${location || "?"}`);
  }),
  await check("Painel → api (RPC PainelApi)", `${urls.admin}/api/health`, (response, text) => {
    expectStatus(response, 200);
    expectJsonOk(text);
  }),
];

if (results.includes(false)) process.exit(1);
console.log("smoke: tudo ok.");
