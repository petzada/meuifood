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
});
