#!/usr/bin/env node
// Tamanho do Worker (gzip) por `wrangler deploy --dry-run`, contra o teto de 10 MiB do
// Workers Paid. Uso no CI depois do build: node scripts/worker-size.mjs apps/web apps/admin apps/api
// OPEN_NEXT_DEPLOY=true impede o wrangler de delegar ao `opennextjs-cloudflare deploy`.
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIMIT_MIB = 10;
const WARN_MIB = 8;

function parseGzipMiB(output) {
  const match = /gzip:\s*([\d.]+)\s*(KiB|MiB)/.exec(output);
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] === "KiB" ? value / 1024 : value;
}

let failed = false;
for (const dir of process.argv.slice(2)) {
  const outdir = mkdtempSync(join(tmpdir(), "worker-size-"));
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "deploy", "--dry-run", "--outdir", outdir],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, OPEN_NEXT_DEPLOY: "true" },
      shell: process.platform === "win32",
    },
  );
  const output = `${result.stdout}\n${result.stderr}`;
  const size = parseGzipMiB(output);
  if (result.status !== 0 || size === null) {
    console.error(`${dir}: dry-run falhou\n${output}`);
    failed = true;
    continue;
  }
  const label = `${dir}: ${size.toFixed(2)} MiB gzip (teto ${LIMIT_MIB} MiB)`;
  if (size >= LIMIT_MIB) {
    console.error(`::error::${label}`);
    failed = true;
  } else if (size >= WARN_MIB) {
    console.log(`::warning::${label}`);
  } else {
    console.log(label);
  }
}
process.exit(failed ? 1 : 0);
