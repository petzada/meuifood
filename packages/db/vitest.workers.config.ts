// Testes com D1 (workerd + SQLite do Miniflare). Rodam SÓ no CI (`pnpm test:workers`);
// o pre-push local (`test:related`) usa vitest.config.ts, que exclui *.d1.test.ts.
import { resolve } from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const migrationsDir = resolve(import.meta.dirname, "migrations");

export default defineConfig(async () => {
  const migrations = await readD1Migrations(migrationsDir);
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-11-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      name: "db-d1",
      include: ["src/**/*.d1.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
