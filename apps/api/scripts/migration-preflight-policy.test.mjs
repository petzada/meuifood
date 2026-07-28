import { describe, expect, it } from "vitest";

import {
  assertIsolationCatalog,
  pendingCanonicalMigrations,
} from "./migration-preflight-policy.mjs";

const local = [
  { name: "first", version: "20260728130000" },
  { name: "second", version: "20260728132500" },
];

describe("preflight transacional de migrations", () => {
  it("retorna apenas migrations ainda não aplicadas", () => {
    expect(pendingCanonicalMigrations(local, ["20260728130000"])).toEqual([
      local[1],
    ]);
  });

  it("falha fechado quando o remoto não é prefixo canônico", () => {
    expect(() =>
      pendingCanonicalMigrations(local, ["20260728132500"]),
    ).toThrow("Histórico remoto não é prefixo");
  });

  it("rejeita role privilegiada ou tabela sem RLS forçada", () => {
    expect(() =>
      assertIsolationCatalog({
        role: {
          bypassRls: true,
          inheritsPrivilegedRole: false,
          superuser: false,
        },
        tables: [
          { forceRowSecurity: true, name: "stores", rowSecurity: true },
          {
            forceRowSecurity: true,
            name: "store_members",
            rowSecurity: true,
          },
        ],
      }),
    ).toThrow("foode_business possui privilégio de bypass");

    expect(() =>
      assertIsolationCatalog({
        role: {
          bypassRls: false,
          inheritsPrivilegedRole: false,
          superuser: false,
        },
        tables: [
          { forceRowSecurity: false, name: "stores", rowSecurity: true },
          {
            forceRowSecurity: true,
            name: "store_members",
            rowSecurity: true,
          },
        ],
      }),
    ).toThrow("RLS efetiva ausente");

    expect(() =>
      assertIsolationCatalog({
        role: {
          bypassRls: false,
          inheritsPrivilegedRole: true,
          superuser: false,
        },
        tables: [
          { forceRowSecurity: true, name: "stores", rowSecurity: true },
          {
            forceRowSecurity: true,
            name: "store_members",
            rowSecurity: true,
          },
        ],
      }),
    ).toThrow("foode_business herda role privilegiada");
  });
});
