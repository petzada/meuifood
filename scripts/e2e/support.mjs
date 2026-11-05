// Apoio do smoke E2E: URLs, estado da Loja de smoke, sessões e axe.
// Callbacks de page.evaluate/addInitScript rodam no navegador.
/* global window, document */
import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

const trimSlash = (url) => url.replace(/\/+$/u, "");

export const urls = {
  web: trimSlash(process.env.SMOKE_WEB_URL || "https://foodedelivery.com.br"),
  admin: trimSlash(process.env.SMOKE_ADMIN_URL || "https://admin.foodedelivery.com.br"),
};

/** Estado do seed (`smoke-store.mjs seed`); null = sem Loja de smoke (só páginas públicas). */
export function readSmokeState() {
  const path = process.env.SMOKE_E2E_STATE;
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Contexto do Painel autenticado pela sessão gravada no D1 (cookie assinado). */
export async function painelContext(browser, state, who) {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: state.cookieName,
      value: state.cookies[who],
      url: urls.admin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  // Impressão: `window.print()` abriria o diálogo do sistema. Guarda o texto do cupom montado
  // no momento da chamada e dispara `afterprint`, como o navegador faria ao fechar o diálogo.
  await context.addInitScript(() => {
    window.print = () => {
      window.__foodeReceipt = document.getElementById("cupom-80mm")?.textContent ?? "";
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  return context;
}

/** O tour da fila abre no 1º acesso de cada usuário: fecha sempre que aparecer. */
export async function dismissQueueTour(page) {
  await page.addLocatorHandler(page.getByRole("button", { name: "Pular tour" }), (button) =>
    button.click(),
  );
}

/** Falha com violações sérias/críticas do axe (WCAG 2.x A/AA) na página atual. */
export async function expectAccessible(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // Iframe do Turnstile/terceiros: fora do nosso controle e de outra origem.
    .exclude('iframe[src*="challenges.cloudflare.com"]')
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map(
      (violation) =>
        `${violation.impact} ${violation.id}: ${violation.help} — ${violation.nodes
          .slice(0, 3)
          .map((node) => `${node.target.join(" ")} (${node.any?.[0]?.message ?? ""})`)
          .join(" | ")}`,
    );
  expect(serious, `axe em ${label}`).toEqual([]);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
