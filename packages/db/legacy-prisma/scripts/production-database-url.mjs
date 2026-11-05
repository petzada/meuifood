import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const databasePackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(databasePackageRoot, "../..");

function requiredSecret(source, name) {
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) throw new Error(`${name} não foi configurada.`);

  const value = line.slice(line.indexOf("=") + 1).trim();
  const unquoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1)
      : value;
  if (!unquoted) throw new Error(`${name} está vazia.`);
  return unquoted;
}

export async function productionDatabaseUrl(purpose) {
  let password = process.env.SUPABASE_DB_PASSWORD?.trim();
  let pooler = process.env.SUPABASE_POOLER_URL?.trim();
  if (Boolean(password) !== Boolean(pooler)) {
    throw new Error(
      "SUPABASE_DB_PASSWORD e SUPABASE_POOLER_URL devem ser configuradas juntas.",
    );
  }

  if (!password || !pooler) {
    const environmentFile = resolve(repositoryRoot, ".env");
    const poolerFile = resolve(repositoryRoot, "supabase/.temp/pooler-url");
    if (!existsSync(environmentFile) || !existsSync(poolerFile)) {
      throw new Error(
        `Configure as credenciais do Supabase de produção para ${purpose}.`,
      );
    }
    const [environmentSource, poolerSource] = await Promise.all([
      readFile(environmentFile, "utf8"),
      readFile(poolerFile, "utf8"),
    ]);
    password = requiredSecret(environmentSource, "SUPABASE_DB_PASSWORD");
    pooler = poolerSource.trim();
  }

  const url = new URL(pooler);
  url.password = password;
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  return url.toString();
}
