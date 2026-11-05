// Seed de produção: cria (ou promove) só os usuários `foode_ops` listados em
// FOODE_OPS_EMAILS (decisão 62). Sem senha: o acesso inicial é por e-mail de definição
// de senha (Ticket 22). Idempotente: rodar de novo não duplica nem altera outros dados.

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Lista de e-mails normalizada (minúsculas, sem repetição); lança se algum for inválido. */
export function parseOpsEmails(raw) {
  const emails = [
    ...new Set(
      String(raw ?? "")
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const invalid = emails.filter((email) => !EMAIL_PATTERN.test(email));
  if (invalid.length > 0) {
    throw new Error(`FOODE_OPS_EMAILS tem ${invalid.length} e-mail(s) inválido(s)`);
  }
  return emails;
}

/** SQL idempotente para `wrangler d1 execute --file`. `newId` é injetável para teste. */
export function buildSeedSql(emails, newId = () => crypto.randomUUID()) {
  if (emails.length === 0) return "";
  // O padrão de e-mail já barra aspas; o escape é defesa extra.
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  return emails
    .map(
      (email) =>
        `INSERT INTO users (id, email, name, platform_role) VALUES (${quote(newId())}, ${quote(email)}, '', 'foode_ops')\n` +
        `  ON CONFLICT (email) DO UPDATE SET platform_role = 'foode_ops', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')\n` +
        `  WHERE users.platform_role IS NOT 'foode_ops';`,
    )
    .join("\n");
}
