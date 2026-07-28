export function pendingCanonicalMigrations(localMigrations, remoteVersions) {
  const expectedRemote = localMigrations
    .slice(0, remoteVersions.length)
    .map((migration) => migration.version);
  if (JSON.stringify(expectedRemote) !== JSON.stringify(remoteVersions)) {
    throw new Error(
      "Histórico remoto não é prefixo das migrations Prisma canônicas.",
    );
  }
  return localMigrations.slice(remoteVersions.length);
}

export function assertIsolationCatalog({ role, tables }) {
  if (!role || role.bypassRls || role.superuser) {
    throw new Error("foode_business possui privilégio de bypass.");
  }
  if (role.inheritsPrivilegedRole) {
    throw new Error("foode_business herda role privilegiada.");
  }

  const requiredTables = new Set([
    "stores",
    "store_members",
    "menu_categories",
    "menu_items",
    "menu_complement_groups",
    "menu_complement_options",
    "menu_additionals",
    "store_operating_periods",
  ]);
  for (const table of tables) {
    if (!table.rowSecurity || !table.forceRowSecurity) {
      throw new Error(`RLS efetiva ausente em ${table.name}.`);
    }
    requiredTables.delete(table.name);
  }
  if (requiredTables.size > 0) {
    throw new Error(
      `RLS efetiva ausente em ${[...requiredTables].sort().join(", ")}.`,
    );
  }
}
