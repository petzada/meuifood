// Testes ligados ao diff do branch (`pnpm test:related`, antes de abrir o PR; não roda em hook).
// Compara com o merge-base do branch padrão do remoto e roda `vitest related --run` só
// nos arquivos de código alterados. Sem arquivos de código no diff, não roda nada.
// Testes com D1 (`*.d1.test.ts`) NUNCA rodam aqui: só no CI (`pnpm test:workers`).
// Argumentos extras vão direto para o vitest (ex.: --testTimeout=60000).
// O vitest é chamado pela API Node (`vitest/node`), no mesmo processo: a lista de arquivos
// nunca passa por shell nem por linha de comando (sem o limite de ~8 KB do cmd no Windows).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseCLI, startVitest } from "vitest/node";

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

// shared/ui exportam dist para o vitest (o typecheck lê o src e não precisa dele): gera se
// faltar ou se o diff mexe no src deles, para os testes dos apps não usarem dist velho.
const stale =
  !existsSync("packages/shared/dist") ||
  !existsSync("packages/ui/dist") ||
  files.some((f) => /^packages\/(shared|ui)\/src\//.test(f));
if (stale) {
  const build = spawnSync("pnpm", ["run", "build:packages"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

console.log(`test-related: ${files.length} arquivo(s) alterado(s) desde ${from.slice(0, 8)}.`);
const { filter, options } = parseCLI(["vitest", ...process.argv.slice(2)]);
const vitest = await startVitest("test", filter, {
  ...options,
  run: true,
  related: files,
  passWithNoTests: true,
  cliExclude: [...(options.cliExclude ?? []), "**/*.d1.test.ts"],
});
const failed = !vitest || vitest.state.getCountOfFailedTests() > 0 || process.exitCode;
await vitest?.close();
process.exit(failed ? 1 : 0);
