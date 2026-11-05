// Fluxo crítico em produção com a Loja sintética `smoke-foode` (Ticket 30): Storefront, busca,
// carrinho, checkout "Pagamento na entrega" com troco, Pedido na fila do Painel, impressão,
// cancelamento, Pausa pelo Operador bloqueando o checkout, `/ops` só para o Ops e os estados
// vazio/carregando/erro (T-04) da fila e do `/ops`; axe nas páginas principais.
//
// Só roda com o estado do seed (workflow `e2e-producao.yml`): ele cria a Loja, os usuários
// sintéticos e as sessões, e o cleanup apaga tudo no fim (`if: always()`).
// Callbacks de page.evaluate rodam no navegador.
/* global window */
import { expect, test } from "@playwright/test";

import {
  dismissQueueTour,
  expectAccessible,
  painelContext,
  readSmokeState,
  sleep,
  urls,
} from "./support.mjs";

const state = readSmokeState();
const QUEUE_LIST = /\/api\/pedidos\?.*scope=active/u;
const PAUSED_MESSAGE = "A Loja pausou os pedidos agora.";
const CHANGE_FOR = "50";

test.describe.configure({ mode: "serial" });
test.skip(!state, "sem SMOKE_E2E_STATE: o fluxo com a Loja de smoke só roda no e2e-producao.yml");

/** @type {{ operator: import("@playwright/test").Page, consumer: import("@playwright/test").Page, ops: import("@playwright/test").Page }} */
const pages = {};
let orderCode = "";

test.beforeAll(async ({ browser }) => {
  const operator = await painelContext(browser, state, "operator");
  const ops = await painelContext(browser, state, "ops");
  const consumer = await browser.newContext();
  pages.operator = await operator.newPage();
  pages.ops = await ops.newPage();
  pages.consumer = await consumer.newPage();
  await dismissQueueTour(pages.operator);
});

test.afterAll(async () => {
  for (const page of Object.values(pages)) await page?.context().close();
});

const storeUrl = () => `${urls.web}/loja/${state.store.slug}`;
const [burger, juice] = state?.menu ?? [];

async function addBurgerToCart(page) {
  await page.goto(storeUrl());
  await page
    .getByRole("button", { name: new RegExp(burger.name, "u") })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: burger.name });
  await sheet.getByRole("button", { name: /^Adicionar · /u }).click();
  await expect(page.getByRole("button", { name: /Ver carrinho/u })).toBeVisible();
}

test("fila do Operador: carregando, erro e vazia (T-04)", async () => {
  const page = pages.operator;

  // Carregando: a 1ª busca da lista demora; o esqueleto `aria-busy` aparece antes da fila.
  let delayed = false;
  await page.route(QUEUE_LIST, async (route) => {
    if (!delayed) {
      delayed = true;
      await sleep(3_000);
    }
    await route.continue();
  });
  await page.goto(`${urls.admin}/`);
  await expect(page.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  await expect(page.getByText("Nenhum Pedido agora.")).toBeVisible();
  await page.unroute(QUEUE_LIST);

  // Erro: a api do Painel responde 500; a fila mostra o alerta e "Tentar de novo".
  await page.route(QUEUE_LIST, (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.reload();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Não foi possível carregar os Pedidos." });
  await expect(alert).toBeVisible();
  await page.unroute(QUEUE_LIST);
  await alert.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByText("Nenhum Pedido agora.")).toBeVisible();
  await expectAccessible(page, "Painel / (fila vazia)");
});

test("Storefront: busca no Cardápio e carrinho", async () => {
  const page = pages.consumer;
  await page.goto(storeUrl());
  await expect(page.getByRole("heading", { name: state.store.name, level: 1 })).toBeVisible();
  await expectAccessible(page, "Storefront da Loja de smoke");

  await page.getByLabel("Buscar no Cardápio").fill("burger");
  await expect(
    page.getByRole("button", { name: new RegExp(burger.name, "u") }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(juice.name, "u") })).toHaveCount(0);

  await page
    .getByRole("button", { name: new RegExp(burger.name, "u") })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: burger.name });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /^Adicionar · /u }).click();

  await page.getByRole("button", { name: /Ver carrinho\s*1 item/u }).click();
  const cart = page.getByRole("dialog", { name: "Carrinho" });
  await expect(cart.getByText(burger.name, { exact: false })).toBeVisible();
  await cart.getByRole("link", { name: /Finalizar pedido/u }).click();
  await expect(page).toHaveURL(/\/finalizar/u);
});

test("checkout com Pagamento na entrega e troco cria o Pedido", async () => {
  const page = pages.consumer;
  await expect(page.getByText(burger.name, { exact: false }).first()).toBeVisible();
  await expectAccessible(page, "checkout");

  // Dados fictícios (nenhum dado pessoal real).
  await page.getByLabel("WhatsApp", { exact: true }).fill("11900000000");
  await page.getByLabel("Nome e sobrenome", { exact: true }).fill("Smoke Teste");
  const onDelivery = page.getByRole("radio", { name: /Pagamento na entrega/u });
  if ((await onDelivery.count()) > 0 && !(await onDelivery.isChecked())) await onDelivery.check();
  await page.getByLabel("Troco para", { exact: true }).fill(CHANGE_FOR);

  await page.getByRole("button", { name: /^Fazer pedido/u }).click();
  await expect(page).toHaveURL(/\/pedido\//u, { timeout: 45_000 });
  const heading = page.getByRole("heading", { name: /Pedido #\d+/u, level: 1 });
  await expect(heading).toBeVisible();
  orderCode = (await heading.textContent())?.match(/#(\d+)/u)?.[1] ?? "";
  expect(orderCode).not.toBe("");
  await expectAccessible(page, "acompanhamento do Pedido");
});

test("Pedido chega na fila, detalhe com troco, impressão e cancelamento", async () => {
  const page = pages.operator;
  const received = page.getByRole("region", { name: /^Recebidos \(\d+\)/u });
  // Polling da fila: 10 s.
  await expect(received.getByText(`#${orderCode}`)).toBeVisible({ timeout: 45_000 });

  await received.getByRole("button", { name: `Abrir detalhe do Pedido #${orderCode}` }).click();
  const payment = page.getByRole("region", { name: "Pagamento" });
  await expect(payment).toContainText(`${CHANGE_FOR},00`);

  await page.getByRole("button", { name: "Imprimir" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__foodeReceipt ?? ""), { timeout: 15_000 })
    .toContain("PAGAR NA ENTREGA");
  const receipt = await page.evaluate(() => window.__foodeReceipt ?? "");
  expect(receipt).toContain(burger.name);
  expect(receipt).toContain("Troco para");

  await page.getByRole("button", { name: "Cancelar Pedido" }).click();
  const dialog = page.getByRole("dialog", { name: `Cancelar o Pedido #${orderCode}?` });
  await dialog.getByRole("radio", { name: "Consumidor pediu" }).check();
  await dialog.getByRole("button", { name: "Cancelar o Pedido" }).click();
  await expect(received.getByText(`#${orderCode}`)).toHaveCount(0, { timeout: 30_000 });
});

test("Pausa pelo Operador bloqueia o checkout e Retomar libera", async () => {
  const operator = pages.operator;
  const consumer = pages.consumer;
  await operator.goto(`${urls.admin}/`);
  await operator.getByRole("button", { name: "Pausar Pedidos" }).first().click();
  await operator.getByRole("button", { name: "Confirmar Pausa" }).click();
  await expect(operator.getByText("Em Pausa").first()).toBeVisible();

  await addBurgerToCart(consumer);
  await consumer.goto(`${storeUrl()}/finalizar`);
  await expect(consumer.getByText(PAUSED_MESSAGE).first()).toBeVisible();
  await expect(
    consumer.getByRole("button", { name: /Pedidos indisponíveis agora/u }),
  ).toBeDisabled();

  await operator.getByRole("button", { name: "Retomar" }).first().click();
  await expect(operator.getByText("Em Pausa")).toHaveCount(0);
  await consumer.reload();
  await expect(consumer.getByText(burger.name, { exact: false }).first()).toBeVisible();
  await expect(consumer.getByText(PAUSED_MESSAGE)).toHaveCount(0);
});

test("/ops: Operador barrado; Ops vê as Lojas, carregando e erro (T-04)", async () => {
  await pages.operator.goto(`${urls.admin}/ops`);
  await expect(pages.operator).not.toHaveURL(/\/ops/u);

  const page = pages.ops;
  await page.goto(`${urls.admin}/ops`);
  await expect(page.getByRole("heading", { name: "Lojas", level: 1 })).toBeVisible();
  await expect(page.getByRole("table")).toContainText(state.store.name);
  await expectAccessible(page, "/ops (Lojas)");

  // Carregando: a navegação do cliente para outra página Ops espera o RSC; o esqueleto aparece.
  const taxas = /\/ops\/taxas/u;
  await page.route(taxas, async (route) => {
    if (route.request().headers()["rsc"]) await sleep(3_000);
    await route.continue();
  });
  await page
    .getByRole("navigation", { name: "Navegação do Painel" })
    .getByRole("link", { name: "Taxas Foode" })
    .last()
    .click();
  await expect(page.getByRole("region", { name: "Carregando área Ops" })).toBeVisible();
  await expect(page).toHaveURL(taxas);
  await page.unroute(taxas);

  // Erro: id de Loja inválido → a api recusa → error.tsx com "Tentar de novo".
  await page.goto(`${urls.admin}/ops/lojas/smoke-inexistente`);
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Não foi possível carregar a área Ops." });
  await expect(error).toBeVisible();
  await expect(error.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
});
