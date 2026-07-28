export function assertProductionState({ localVersions, remoteVersions, residue }) {
  if (JSON.stringify(localVersions) !== JSON.stringify(remoteVersions)) {
    throw new Error(
      "Histórico remoto de migrations divergente da fonte canônica Prisma.",
    );
  }

  if (residue.stores !== 0 || residue.memberships !== 0) {
    throw new Error(
      `Fixtures sintéticas residuais: Lojas=${residue.stores}, ` +
        `memberships=${residue.memberships}.`,
    );
  }
}
