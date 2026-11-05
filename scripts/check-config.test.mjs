import { describe, expect, it } from "vitest";

import {
  configuredCrons,
  cronRow,
  domainRows,
  migrationRow,
  parseDsn,
  renderTable,
  STATUS,
  webhookProbeRow,
  WORKER_EXPECTATIONS,
  workerRows,
} from "./check-config.mjs";

describe("workerRows", () => {
  it("obrigatório ausente = erro; bloco humano ausente = faltando; presentes = ok", () => {
    const expected = WORKER_EXPECTATIONS["foode-api"];
    const rows = workerRows("foode-api", [
      ...expected.required.filter((name) => name !== "ORDER_TOKEN_SECRET"),
      "SENTRY_DSN",
      "DB",
      "MEDIA",
      "BETTER_AUTH_URL",
      "EMAIL_FROM",
    ]);
    const byItem = Object.fromEntries(rows.map((r) => [r.item, r.status]));
    expect(byItem.ORDER_TOKEN_SECRET).toBe(STATUS.error);
    expect(byItem.BETTER_AUTH_SECRET).toBe(STATUS.ok);
    expect(byItem.SENTRY_DSN).toBe(STATUS.ok);
    expect(byItem.ABACATEPAY_API_KEY).toBe(STATUS.missing);
    expect(byItem["binding DB"]).toBe(STATUS.ok);
  });

  it("web e admin exigem o service binding da api", () => {
    expect(workerRows("foode-admin", []).find((r) => r.item === "binding API")?.status).toBe(
      STATUS.error,
    );
  });
});

describe("Cron", () => {
  const wrangler = `{
    // https://exemplo — comentário com barra dupla
    "routes": [{ "pattern": "api.foodedelivery.com.br" }],
    "triggers": { "crons": ["*/10 * * * *", "0 9 * * 1-5"] },
  }`;

  it("lê triggers.crons do JSONC", () => {
    expect(configuredCrons(wrangler)).toEqual(["*/10 * * * *", "0 9 * * 1-5"]);
    expect(configuredCrons("{}")).toEqual([]);
  });

  it("sem Cron na master e nada publicado = faltando; publicado diferente = erro", () => {
    expect(cronRow([], []).status).toBe(STATUS.missing);
    expect(cronRow(["*/10 * * * *"], []).status).toBe(STATUS.error);
    expect(cronRow(["*/10 * * * *"], ["*/10 * * * *"]).status).toBe(STATUS.ok);
  });
});

describe("migrationRow", () => {
  it("lista as pendentes", () => {
    const row = migrationRow(["0000_a.sql", "0001_b.sql"], ["0000_a.sql"]);
    expect(row.status).toBe(STATUS.error);
    expect(row.detail).toContain("0001_b.sql");
    expect(migrationRow(["0000_a.sql"], ["0000_a.sql"]).status).toBe(STATUS.ok);
  });
});

describe("domainRows", () => {
  it("cada domínio no Worker certo", () => {
    const rows = domainRows([
      { hostname: "foodedelivery.com.br", service: "foode-web" },
      { hostname: "admin.foodedelivery.com.br", service: "foode-web" },
    ]);
    expect(rows.map((r) => r.status)).toEqual([STATUS.ok, STATUS.error, STATUS.error]);
  });
});

describe("webhookProbeRow", () => {
  it("503 = sem chaves (bloco humano); 401 = responde e recusa; 500 = erro", () => {
    expect(webhookProbeRow("efi", 503).status).toBe(STATUS.missing);
    expect(webhookProbeRow("efi", 401).status).toBe(STATUS.ok);
    expect(webhookProbeRow("efi", 500).status).toBe(STATUS.error);
  });
});

describe("parseDsn", () => {
  it("monta o endpoint de envelope sem expor a chave no endpoint", () => {
    expect(parseDsn("https://abc123@o1.ingest.sentry.io/4507")).toEqual({
      endpoint: "https://o1.ingest.sentry.io/api/4507/envelope/",
      publicKey: "abc123",
    });
    expect(parseDsn("não é url")).toBeNull();
    expect(parseDsn("https://o1.ingest.sentry.io/4507")).toBeNull();
  });
});

describe("renderTable", () => {
  it("tabela markdown com o resumo por estado", () => {
    const table = renderTable([
      { area: "D1", item: "migrations", status: STATUS.ok, detail: "a|b" },
      { area: "Sentry", item: "DSN api", status: STATUS.missing, detail: "" },
    ]);
    expect(table).toContain("| D1 | migrations | ok | a/b |");
    expect(table).toContain("1 ok · 1 faltando (bloco humano) · 0 erro");
  });
});
