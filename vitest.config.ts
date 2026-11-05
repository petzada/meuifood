// Testes sem banco do monorepo (local, pre-push e CI). Cada pacote/app usa o próprio
// vitest.config.ts (web e admin com happy-dom + Testing Library). Testes com D1
// (`*.d1.test.ts`, vitest.workers.config.ts de cada pacote) ficam fora: só no CI, por
// `pnpm test:workers`.
//
// Cobertura (decisão 67): `pnpm test:coverage` (CI, job `qualidade`) exige 80% de linhas em
// `packages/shared` e `packages/db`. Fora da conta: testes, fixtures, ajudantes de teste e
// os módulos de acesso ao D1 de `packages/db` (foode-db, menu, ops-db), que só rodam no
// workerd dos testes `*.d1.test.ts` — o pool do Cloudflare não emite cobertura V8.
import { defineConfig } from "vitest/config";

const COVERAGE_LINES = 80;

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      "apps/*",
      "packages/*",
      {
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.mjs"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text"],
      include: ["packages/shared/src/**/*.ts", "packages/db/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d1.test.ts",
        "**/fixtures.ts",
        "**/*.d.ts",
        "**/legacy-*/**",
        "packages/db/src/testing/**",
        // Acesso ao D1: cobertos pelos *.d1.test.ts no workerd (só CI).
        "packages/db/src/foode-db.ts",
        "packages/db/src/menu.ts",
        "packages/db/src/ops-db.ts",
      ],
      thresholds: {
        "packages/shared/src/**": { lines: COVERAGE_LINES },
        "packages/db/src/**": { lines: COVERAGE_LINES },
      },
    },
  },
});
