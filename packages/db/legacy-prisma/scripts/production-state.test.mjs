import { describe, expect, it } from "vitest";

import { assertProductionState } from "./production-state.mjs";

describe("estado do banco de produção após a integração", () => {
  it("aceita histórico sincronizado e ausência de resíduos", () => {
    expect(() =>
      assertProductionState({
        localVersions: ["20260728130000", "20260728132500"],
        remoteVersions: ["20260728130000", "20260728132500"],
        residue: { memberships: 0, stores: 0 },
      }),
    ).not.toThrow();
  });

  it("rejeita drift no histórico de migrations", () => {
    expect(() =>
      assertProductionState({
        localVersions: ["20260728130000", "20260728132500"],
        remoteVersions: ["20260728130000"],
        residue: { memberships: 0, stores: 0 },
      }),
    ).toThrow("Histórico remoto de migrations divergente");
  });

  it("rejeita qualquer fixture residual", () => {
    expect(() =>
      assertProductionState({
        localVersions: ["20260728130000"],
        remoteVersions: ["20260728130000"],
        residue: { memberships: 2, stores: 1 },
      }),
    ).toThrow("Fixtures sintéticas residuais");
  });
});
