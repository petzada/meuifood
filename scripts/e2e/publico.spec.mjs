// Páginas públicas (só leitura): renderizam e passam no axe. Rodam sem o estado do seed.
import { expect, test } from "@playwright/test";

import { expectAccessible, urls } from "./support.mjs";

test.describe("páginas públicas", () => {
  test("landing do Storefront", async ({ page }) => {
    await page.goto(`${urls.web}/`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page, "landing /");
  });

  test("Política de Privacidade", async ({ page }) => {
    await page.goto(`${urls.web}/privacidade`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page, "/privacidade");
  });

  test("login do Painel e guarda do /ops sem sessão", async ({ page }) => {
    await page.goto(`${urls.admin}/entrar`);
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expectAccessible(page, "Painel /entrar");

    await page.goto(`${urls.admin}/ops`);
    await expect(page).toHaveURL(/\/entrar/u);
  });
});
