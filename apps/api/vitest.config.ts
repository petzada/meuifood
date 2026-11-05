// Testes sem banco/workerd (local e pre-push). Testes de rota com D1 ficam em
// vitest.workers.config.ts e só rodam no CI.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    include: ["src/**/*.test.ts"],
    exclude: ["**/*.d1.test.ts", "**/node_modules/**"],
  },
});
