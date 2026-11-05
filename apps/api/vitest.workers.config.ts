// Testes de rota no workerd com o D1 do Miniflare (wrangler.jsonc, binding DB). Rodam SÓ
// no CI (`pnpm test:workers`); nada aqui fala com o D1 remoto.
import { resolve } from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const migrationsDir = resolve(import.meta.dirname, "../../packages/db/migrations");

export default defineConfig(async () => {
  const migrations = await readD1Migrations(migrationsDir);
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      name: "api-d1",
      include: ["src/**/*.d1.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
