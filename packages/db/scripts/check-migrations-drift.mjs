#!/usr/bin/env node
// Falha se src/schema/*.ts tiver mudança sem migration gerada: roda `drizzle-kit generate`
// e confere se apareceu arquivo novo/alterado em migrations/. Usado no CI.
import { execFileSync, spawnSync } from "node:child_process";

const generate = spawnSync("pnpm", ["exec", "drizzle-kit", "generate", "--name", "drift_check"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (generate.status !== 0) process.exit(generate.status ?? 1);

const status = execFileSync("git", ["status", "--porcelain", "--", "migrations"], {
  encoding: "utf8",
}).trim();

if (status) {
  console.error(
    "Schema e migrations divergem: rode `pnpm db:generate -- --name <nome>` e commite o SQL.\n" +
      status,
  );
  process.exit(1);
}
console.log("migrations em dia com src/schema/*.ts.");
