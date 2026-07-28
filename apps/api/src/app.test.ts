import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("GET /health", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("responde o estado público da API em JSON", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ok", service: "api" });
  });

  it("não registra credenciais, cookies, query ou dados pessoais recebidos", async () => {
    const logLines: string[] = [];
    const loggerDestination = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(String(chunk));
        callback();
      },
    });
    const app = buildApp({ loggerDestination });
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/health?email=consumidor%40example.com",
      headers: {
        authorization: "Bearer segredo-do-teste",
        cookie: "session=cookie-do-teste",
        "x-api-key": "chave-do-teste",
      },
    });

    const logs = logLines.join("");
    expect(logs).toContain('"path":"/health"');
    expect(logs).not.toContain("consumidor@example.com");
    expect(logs).not.toContain("segredo-do-teste");
    expect(logs).not.toContain("cookie-do-teste");
    expect(logs).not.toContain("chave-do-teste");
  });
});
