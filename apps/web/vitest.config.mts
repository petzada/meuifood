// Testes sem banco do `web`: lógica pura, route handlers e componentes (Testing Library +
// happy-dom, decisão 67). Fetch/RPC sempre mocados; nada fala com a api de verdade.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.d1.test.ts", "**/node_modules/**"],
    setupFiles: ["./src/test/setup.ts"],
    // O 1º import de página (Next + Sentry + fixtures) passa de 5 s com cobertura e todos
    // os projetos em paralelo.
    testTimeout: 15_000,
  },
});
