// Prova a regra de lint da fronteira do D1 (eslint.config.mjs, ADR 0006).
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd });

async function messagesFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
}

describe("fronteira do D1 no lint", () => {
  it("proíbe D1 cru, Drizzle e env.DB solto nos apps", async () => {
    const rules = await messagesFor(
      [
        'import { drizzle } from "drizzle-orm/d1";',
        "export async function handler(env: { DB: D1Database }) {",
        '  await env.DB.prepare("SELECT * FROM stores").all();',
        "  return drizzle(env.DB);",
        "}",
      ].join("\n"),
      "apps/api/src/rota-proibida.ts",
    );
    expect(rules).toContain("no-restricted-imports");
    expect(rules.filter((rule) => rule === "no-restricted-syntax").length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("permite createFoodeDb(env.DB) nos apps", async () => {
    const rules = await messagesFor(
      [
        'import { createFoodeDb } from "@foode/db";',
        "export function handler(env: { DB: D1Database }) {",
        "  return createFoodeDb(env.DB);",
        "}",
      ].join("\n"),
      "apps/api/src/rota-permitida.ts",
    );
    expect(rules).toEqual([]);
  });

  it("fixture de teste só em arquivo de teste", async () => {
    const code = 'import { seedTwoStores } from "@foode/db/testing";\nexport { seedTwoStores };\n';
    expect(await messagesFor(code, "apps/api/src/rota.ts")).toContain("no-restricted-imports");
    expect(await messagesFor(code, "apps/api/src/rota.d1.test.ts")).toEqual([]);
  });

  it("dentro de packages/db o acesso direto é permitido", async () => {
    const rules = await messagesFor(
      'export const q = (d1: D1Database) => d1.prepare("SELECT 1");\n',
      "packages/db/src/interno.ts",
    );
    expect(rules).toEqual([]);
  });
});
