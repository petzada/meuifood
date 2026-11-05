#!/usr/bin/env node
// Lint das migrations do D1 (AGENTS.md §Migrations, expand/contract).
// - Nome `NNNN_nome.sql` em packages/db/migrations.
// - Contract (DROP TABLE/COLUMN, RENAME, recriação de tabela `__new_*`) só com a linha
//   `-- contract: <motivo>` no topo; vai em PR separado e o db-migrate exige confirmação.
// - Sem BEGIN/COMMIT (o wrangler já aplica cada migration numa transação) e sem
//   `PRAGMA foreign_keys` (no D1 use `PRAGMA defer_foreign_keys = on`).
// - Migration que já está no branch padrão é imutável: muda-se com migration nova.
// Uso: node scripts/lint-migrations.mjs [arquivos...]  (sem argumentos: todas)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export const MIGRATIONS_DIR = "packages/db/migrations";
const NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const CONTRACT_MARKER = /^\s*--\s*contract:\s*\S/m;
const CONTRACT_PATTERNS = [
  [/\bDROP\s+TABLE\b/i, "DROP TABLE"],
  [/\bDROP\s+COLUMN\b/i, "DROP COLUMN"],
  [/\bALTER\s+TABLE\s+\S+\s+RENAME\b/i, "RENAME"],
  [/\b__new_\w+/i, "recriação de tabela (__new_*)"],
];

/** Erros de uma migration (nome + SQL). Exportado para teste. */
export function lintMigration(name, sql) {
  const errors = [];
  if (!NAME.test(name)) errors.push(`nome fora do padrão NNNN_nome.sql`);
  const code = sql.replace(/--[^\n]*/g, "");
  if (/^\s*(BEGIN|COMMIT|END)\b/im.test(code)) {
    errors.push("BEGIN/COMMIT não: o wrangler aplica a migration numa transação");
  }
  if (/\bPRAGMA\s+foreign_keys\b/i.test(code)) {
    errors.push("PRAGMA foreign_keys não funciona no D1: use PRAGMA defer_foreign_keys = on");
  }
  const addNotNullWithoutDefault = code
    .split(";")
    .some(
      (statement) =>
        /\bALTER\s+TABLE\s+\S+\s+ADD\b/i.test(statement) &&
        /\bNOT\s+NULL\b/i.test(statement) &&
        !/\bDEFAULT\b/i.test(statement),
    );
  if (addNotNullWithoutDefault) {
    errors.push("ADD COLUMN NOT NULL sem DEFAULT (expand: coluna nullable ou com default)");
  }
  const contract = CONTRACT_PATTERNS.filter(([pattern]) => pattern.test(code)).map(
    ([, label]) => label,
  );
  if (contract.length > 0 && !CONTRACT_MARKER.test(sql)) {
    errors.push(
      `operação contract (${contract.join(", ")}) sem a linha "-- contract: <motivo>" — PR separado (AGENTS.md §Migrations)`,
    );
  }
  return errors;
}

export function isContract(sql) {
  return CONTRACT_MARKER.test(sql);
}

function changedSinceBase() {
  for (const ref of ["origin/master", "origin/HEAD"]) {
    try {
      const base = execFileSync("git", ["merge-base", "HEAD", ref], { encoding: "utf8" }).trim();
      return execFileSync("git", ["diff", "--name-status", base, "--", `${MIGRATIONS_DIR}/*.sql`], {
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t"))
        .filter(([status]) => !status.startsWith("A"));
    } catch {
      // sem remoto (ex.: clone raso): pula a checagem de imutabilidade
    }
  }
  return [];
}

function main() {
  const args = process.argv.slice(2);
  const files = (
    args.length > 0
      ? args
      : existsSync(MIGRATIONS_DIR)
        ? readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith(".sql"))
            .map((f) => join(MIGRATIONS_DIR, f))
        : []
  ).filter((file) => file.replaceAll("\\", "/").startsWith(MIGRATIONS_DIR) && existsSync(file));

  let failed = false;
  for (const file of files) {
    for (const error of lintMigration(basename(file), readFileSync(file, "utf8"))) {
      console.error(`${file}: ${error}`);
      failed = true;
    }
  }
  for (const [status, ...paths] of changedSinceBase()) {
    console.error(
      `${paths.join(" -> ")}: migration já no branch padrão não muda (${status}); crie outra.`,
    );
    failed = true;
  }
  if (failed) process.exit(1);
  console.log(`lint-migrations: ${files.length} migration(s) ok.`);
}

if (process.argv[1]?.endsWith("lint-migrations.mjs")) main();
