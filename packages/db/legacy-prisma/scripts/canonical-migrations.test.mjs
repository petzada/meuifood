import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readCanonicalMigrations } from "./canonical-migrations.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function temporaryMigrationsRoot() {
  const root = await mkdtemp(join(tmpdir(), "foode-migrations-"));
  temporaryRoots.push(root);
  return root;
}

describe("fonte canônica de migrations Prisma", () => {
  it("lê versões válidas em ordem", async () => {
    const root = await temporaryMigrationsRoot();
    for (const name of ["20260728132500_second", "20260728130000_first"]) {
      const directory = join(root, name);
      await mkdir(directory);
      await writeFile(join(directory, "migration.sql"), "select 1;", "utf8");
    }

    await expect(readCanonicalMigrations(root)).resolves.toMatchObject([
      { name: "20260728130000_first", version: "20260728130000" },
      { name: "20260728132500_second", version: "20260728132500" },
    ]);
  });

  it("rejeita diretório que a projeção poderia ignorar", async () => {
    const root = await temporaryMigrationsRoot();
    await mkdir(join(root, "migration-sem-timestamp"));

    await expect(readCanonicalMigrations(root)).rejects.toThrow(
      "Diretório de migration inválido",
    );
  });
});
