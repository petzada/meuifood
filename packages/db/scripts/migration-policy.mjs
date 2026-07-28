const destructiveStatements = [
  { label: "DROP TABLE", pattern: /\bdrop\s+table\b/iu },
  {
    label: "DROP COLUMN",
    pattern:
      /\balter\s+table\b[\s\S]*?\bdrop\s+(?:column\b\s*|(?!constraint\b)[a-z_"])/iu,
  },
  { label: "DELETE", pattern: /\bdelete\s+from\b/iu },
  { label: "TRUNCATE", pattern: /\btruncate(?:\s+table)?\b/iu },
  { label: "DROP não autorizado", pattern: /\bdrop\s+(?!index\b)/iu },
  {
    label: "DISABLE ROW LEVEL SECURITY",
    pattern: /\bdisable\s+row\s+level\s+security\b/iu,
  },
  {
    label: "NO FORCE ROW LEVEL SECURITY",
    pattern: /\bno\s+force\s+row\s+level\s+security\b/iu,
  },
  { label: "BYPASSRLS", pattern: /\bbypassrls\b/iu },
  { label: "SUPERUSER", pattern: /\bsuperuser\b/iu },
  { label: "SQL dinâmico EXECUTE", pattern: /\bexecute\b/iu },
];

const transactionControl =
  /^\s*(?:begin\b|start\s+transaction\b|commit\b|rollback\b|end\b)/iu;
const allowedStatement =
  /^\s*(?:create\s+(?:type|table|(?:unique\s+)?index|policy)\b|alter\s+(?:table|role)\b|grant\b|drop\s+index\b|do\b)/iu;
const allowedGrant =
  /^\s*grant\s+(?:(?:(?:usage|select|insert|update|delete)\s*,?\s*)+on\b[\s\S]*\bto\s+foode_business\b|foode_business\s+to\s+postgres\b)/iu;
const allowedDoBody =
  /^\s*begin\s+if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+pg_roles\s+where\s+rolname\s*=\s*'foode_business'\s*\)\s+then\s+create\s+role\s+foode_business\s+nologin\s+nosuperuser\s+nocreatedb\s+nocreaterole\s+noinherit\s+nobypassrls\s*;\s*end\s+if\s*;\s*end\s*$/iu;
const doBlock =
  /\bdo\s+\$([a-z_][a-z0-9_]*)?\$([\s\S]*?)\$\1\$\s*;/giu;

function stripCommentsAndLiterals(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\r\n]*/gu, " ")
    .replace(/'(?:''|[^'])*'/gu, "''")
    .replace(/"(?:""|[^"])*"/gu, '""');
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/--[^\r\n]*/gu, " ");
}

function validateDoBlocks(name, sql) {
  const uncommentedSql = stripComments(sql);
  const remainingSql = uncommentedSql.replace(doBlock, (_block, _tag, body) => {
    if (!allowedDoBody.test(body)) {
      throw new Error(`Migration ${name} contém bloco DO não autorizado.`);
    }
    return " ";
  });

  if (/\bdo\b/iu.test(stripCommentsAndLiterals(remainingSql))) {
    throw new Error(`Migration ${name} contém bloco DO não autorizado.`);
  }
}

function stripDollarQuotedBodies(sql) {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/gu, " ")
    .replace(/\$([a-z_][a-z0-9_]*)\$[\s\S]*?\$\1\$/giu, " ");
}

export function validateMigrationSql(name, sql) {
  const executableSql = stripCommentsAndLiterals(sql).trim();
  if (!executableSql) {
    throw new Error(`Migration ${name} não contém SQL executável.`);
  }

  const transactionSql = stripDollarQuotedBodies(executableSql);
  if (transactionSql.split(";").some((statement) => transactionControl.test(statement))) {
    throw new Error(
      `Migration ${name} contém controle transacional não autorizado.`,
    );
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

  validateDoBlocks(name, sql);

  for (const sqlStatement of transactionSql.split(";")) {
    if (/^\s*grant\b/iu.test(sqlStatement) && !allowedGrant.test(sqlStatement)) {
      throw new Error(`Migration ${name} contém GRANT não autorizado.`);
    }
    if (sqlStatement.trim() && !allowedStatement.test(sqlStatement)) {
      throw new Error(
        `Migration ${name} contém estrutura SQL não autorizada: ` +
          `${sqlStatement.trim().split(/\s+/u).slice(0, 3).join(" ")}.`,
      );
    }
  }
}
