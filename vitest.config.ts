// Testes sem banco do monorepo (local, pre-push e CI). Cada pacote usa o próprio
// vitest.config.ts (ou o padrão do vitest, nos apps Next). Testes com D1
// (`*.d1.test.ts`, vitest.workers.config.ts de cada pacote) ficam fora: só no CI, por
// `pnpm test:workers`.
import { defineConfig } from "vitest/config";

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
  },
});
