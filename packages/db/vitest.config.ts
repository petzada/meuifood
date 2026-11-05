// Testes sem banco (rodam local e no pre-push). Testes com D1 ficam em
// vitest.workers.config.ts e só rodam no CI.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    exclude: ["**/*.d1.test.ts", "**/node_modules/**"],
  },
});
