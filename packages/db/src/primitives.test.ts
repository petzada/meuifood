// Primitivos de @foode/db sem banco: contextos emitidos × falsificados (ADR 0006),
// convenções de dinheiro/data/id e classificação de erro de UNIQUE do D1.
import { describe, expect, it } from "vitest";

import { createAuthDatabase } from "./auth-database";
import {
  assertIssued,
  ForgedContextError,
  issueOpsContext,
  issueStoreContext,
  type StoreContext,
} from "./context";
import { cents, newId, utcNow } from "./conventions";
import { FoodeDbError, isUniqueViolation } from "./errors";

describe("contextos de acesso", () => {
  it("aceita só o contexto emitido pelo pacote e congela o objeto", () => {
    const store = issueStoreContext({ role: "owner", storeId: "loja-a", userId: "u1" });
    const ops = issueOpsContext({ userId: "ops-1" });
    expect(() => assertIssued(store)).not.toThrow();
    expect(() => assertIssued(ops)).not.toThrow();
    expect(Object.isFrozen(store)).toBe(true);
    expect(store).toEqual({ role: "owner", storeId: "loja-a", userId: "u1" });
  });

  it("recusa literal ou cópia de um contexto emitido", () => {
    const issued = issueStoreContext({ role: "operator", storeId: "loja-a", userId: "u1" });
    const forged = { ...issued, storeId: "loja-b" } as StoreContext;
    expect(() => assertIssued(forged)).toThrow(ForgedContextError);
    expect(() => assertIssued({ storeId: "loja-a" })).toThrow("contexto não emitido por @foode/db");
    try {
      assertIssued({});
    } catch (error) {
      expect((error as Error).name).toBe("ForgedContextError");
    }
  });
});

describe("convenções", () => {
  it("cents aceita inteiro seguro não negativo e recusa o resto", () => {
    expect(cents(0)).toBe(0);
    expect(cents(1234)).toBe(1234);
    for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => cents(bad)).toThrow(RangeError);
    }
  });

  it("utcNow segue o formato ISO-8601 UTC com milissegundos das colunas", () => {
    expect(utcNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  });

  it("newId gera UUID v4 distinto a cada chamada", () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(newId()).not.toBe(a);
  });
});

describe("erros", () => {
  it("FoodeDbError carrega o código e usa-o como mensagem padrão", () => {
    const error = new FoodeDbError("slug_unavailable");
    expect(error.code).toBe("slug_unavailable");
    expect(error.message).toBe("slug_unavailable");
    expect(error.name).toBe("FoodeDbError");
    expect(new FoodeDbError("conflict", "já existe").message).toBe("já existe");
  });

  it("isUniqueViolation reconhece o erro do D1 na mensagem ou na causa", () => {
    expect(isUniqueViolation(new Error("D1_ERROR: UNIQUE constraint failed: stores.slug"))).toBe(
      true,
    );
    expect(
      isUniqueViolation(new Error("D1_ERROR", { cause: "UNIQUE constraint failed: users.email" })),
    ).toBe(true);
    expect(isUniqueViolation(new Error("FOREIGN KEY constraint failed"))).toBe(false);
    expect(isUniqueViolation("UNIQUE constraint failed")).toBe(false);
  });
});

describe("adapter do Better Auth", () => {
  it("monta o adapter sobre o binding sem tocar o banco", () => {
    const adapter = createAuthDatabase({} as D1Database);
    expect(typeof adapter).toBe("function");
  });
});
