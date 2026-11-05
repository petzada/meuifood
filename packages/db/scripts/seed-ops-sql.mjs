#!/usr/bin/env node
// Gera o SQL do seed `foode_ops` a partir de FOODE_OPS_EMAILS e grava no arquivo passado
// (uso no workflow db-migrate e na prova do CI). Não imprime os e-mails no log.
// Uso: FOODE_OPS_EMAILS="a@x.com,b@y.com" node scripts/seed-ops-sql.mjs <saida.sql>
import { writeFileSync } from "node:fs";

import { buildSeedSql, parseOpsEmails } from "./seed-ops.mjs";

const output = process.argv[2];
if (!output) {
  console.error("uso: node scripts/seed-ops-sql.mjs <saida.sql>");
  process.exit(2);
}

const emails = parseOpsEmails(process.env.FOODE_OPS_EMAILS);
writeFileSync(output, buildSeedSql(emails), { encoding: "utf8", mode: 0o600 });
console.log(`seed foode_ops: ${emails.length} usuário(s) no SQL gerado.`);
