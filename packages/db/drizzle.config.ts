// drizzle-kit só GERA o SQL (`pnpm db:generate -- --name <nome>`); quem aplica é o
// `wrangler d1 migrations apply` (D1 efêmero no CI e workflow db-migrate em produção).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./migrations",
});
