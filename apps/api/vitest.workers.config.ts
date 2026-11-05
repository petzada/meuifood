// Testes de rota no workerd com o D1 do Miniflare (wrangler.jsonc, binding DB). Rodam SÓ
// no CI (`pnpm test:workers`); nada aqui fala com o D1 remoto.
import { resolve } from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const migrationsDir = resolve(import.meta.dirname, "../../packages/db/migrations");

export default defineConfig(async () => {
  const migrations = await readD1Migrations(migrationsDir);
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Valores só de teste (nenhum é segredo real). TURNSTILE_SECRET_KEY é a chave pública
          // de teste da Cloudflare que sempre aprova; os testes ainda interceptam o siteverify.
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: "segredo-de-teste-do-better-auth-com-32-caracteres-ou-mais",
            BETTER_AUTH_URL: "https://painel.foode.test",
            TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
            MILLIONSEND_API_KEY: "ms_teste_sem_envio",
            EMAIL_FROM: "Foode <nao-responda@foode.test>",
            // PIX (Ticket 26): chaves fictícias; os testes interceptam a AbacatePay no `fetch`.
            ABACATEPAY_API_KEY: "abc_teste",
            ABACATEPAY_WEBHOOK_SECRET: "segredo-webhook-teste",
            ABACATEPAY_SIGNING_KEY: "chave-publica-teste",
            // Cartão (Ticket 27): chaves fictícias; os testes interceptam Efí/AbacatePay no `fetch`.
            ABACATEPAY_PUBLIC_KEY: "pk_dev_publica_teste",
            EFI_CLIENT_ID: "efi-client-id-teste",
            EFI_CLIENT_SECRET: "efi-client-secret-teste",
            EFI_PAYEE_CODE: "0123456789abcdef0123456789abcdef",
            EFI_ENVIRONMENT: "sandbox",
            EFI_NOTIFICATION_SECRET: "segredo-notificacao-efi-teste",
            API_PUBLIC_URL: "https://api.foode.test",
          },
        },
      }),
    ],
    test: {
      name: "api-d1",
      include: ["src/**/*.d1.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
