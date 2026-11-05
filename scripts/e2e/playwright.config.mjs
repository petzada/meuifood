// Smoke E2E pós-deploy (Ticket 30, decisão 67): Playwright Chromium contra PRODUÇÃO.
// URLs: SMOKE_WEB_URL / SMOKE_ADMIN_URL (padrão: domínios próprios). O fluxo com Loja sintética
// só roda com o estado gerado pelo workflow `e2e-producao.yml` (SMOKE_E2E_STATE); sem ele, só
// as páginas públicas (leitura + axe). Nunca rode o fluxo do notebook: ele escreve em produção.
//
//   pnpm e2e                         # smoke HTTP + Playwright (públicas sem o estado)
//   pnpm exec playwright test -c scripts/e2e/playwright.config.mjs --list
import { defineConfig, devices } from "@playwright/test";

const CI = process.env.CI === "true";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "../../test-results/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  // O fluxo é serial e idempotente (o seed limpa a Loja de smoke); 1 nova tentativa no CI.
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [["list"], ["github"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // Animações de entrada (opacity) enganam o axe no meio da transição; reduced-motion as desliga.
    contextOptions: { reducedMotion: "reduce" },
    // Só em falha; os dados são sintéticos e as sessões são apagadas no cleanup do workflow.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium" }],
});
