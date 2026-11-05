// Testes ligados ao diff do branch (pre-push do lefthook e `pnpm test:related`).
// Compara com o merge-base do branch padrão do remoto e roda `vitest related --run` só
// nos arquivos de código alterados. Sem arquivos de código no diff, não roda nada.
// Testes com D1 (`*.d1.test.ts`) NUNCA rodam aqui: só no CI (`pnpm test:workers`).
// Argumentos extras vão direto para o vitest (ex.: --testTimeout=60000).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function base() {
  for (const ref of ["origin/HEAD", "origin/master", "origin/main"]) {
    try {
      return git("merge-base", "HEAD", ref);
    } catch {
      // ref ausente: tenta a próxima
    }
  }
  return null;
}

const from = base();
if (!from) {
  console.log("test-related: sem branch padrão no remoto; nada a comparar.");
  process.exit(0);
}

const files = git("diff", "--name-only", "--diff-filter=d", from, "HEAD")
  .split("\n")
  .filter((f) => /\.(c|m)?(t|j)sx?$/.test(f) && existsSync(f));

if (files.length === 0) {
  console.log("test-related: nenhum arquivo de código no diff; testes pulados.");
  process.exit(0);
}

// shared/ui exportam dist: no pre-push o 1_typecheck já gerou; fora dele, gera se faltar.
if (!existsSync("packages/shared/dist") || !existsSync("packages/ui/dist")) {
  const build = spawnSync("pnpm", ["run", "build:packages"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

console.log(`test-related: ${files.length} arquivo(s) alterado(s) desde ${from.slice(0, 8)}.`);
const r = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "related",
    "--run",
    "--passWithNoTests",
    "--exclude",
    "**/*.d1.test.ts",
    ...process.argv.slice(2),
    ...files,
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(r.status ?? 1);
