// Testes sem banco do `admin`: lógica pura, proxy de auth e componentes (Testing Library +
// happy-dom, decisão 67). Fetch/RPC/server actions sempre mocados.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "admin",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.d1.test.ts", "**/node_modules/**"],
    setupFiles: ["./src/test/setup.ts"],
    // O 1º import de página/componente passa de 5 s com cobertura e todos os projetos em
    // paralelo.
    testTimeout: 15_000,
  },
});
