const destructiveStatements = [
  { label: "DROP TABLE", pattern: /\bdrop\s+table\b/iu },
  {
    label: "DROP COLUMN",
    pattern:
      /\balter\s+table\b[\s\S]*?\bdrop\s+(?:column\b\s*|(?!constraint\b)[a-z_"])/iu,
  },
  { label: "DELETE", pattern: /\bdelete\s+from\b/iu },
  { label: "TRUNCATE", pattern: /\btruncate(?:\s+table)?\b/iu },
];

function stripCommentsAndLiterals(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\r\n]*/gu, " ")
    .replace(/'(?:''|[^'])*'/gu, "''")
    .replace(/"(?:""|[^"])*"/gu, '""');
}

export function validateMigrationSql(name, sql) {
  const executableSql = stripCommentsAndLiterals(sql).trim();
  if (!executableSql) {
    throw new Error(`Migration ${name} não contém SQL executável.`);
  }

  for (const sqlStatement of executableSql.split(";")) {
    for (const statement of destructiveStatements) {
      if (statement.pattern.test(sqlStatement)) {
        throw new Error(
          `Migration ${name} contém comando destrutivo ${statement.label}; ` +
            "uma nova decisão explícita é obrigatória.",
        );
      }
    }
  }
}
