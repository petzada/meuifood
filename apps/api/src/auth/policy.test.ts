import { describe, expect, it } from "vitest";

import { INVITE_RATE_LIMIT } from "../painel-service";
import { AUTH_RATE_LIMIT_RULES, randomToken } from "./auth";
import { rolesWith } from "./guard";

describe("janelas de rate limit", () => {
  it("o convite não usa janela maior que a maior do Better Auth (poda da tabela)", () => {
    const longest = Math.max(...Object.values(AUTH_RATE_LIMIT_RULES).map((rule) => rule.window));
    expect(INVITE_RATE_LIMIT.windowSeconds).toBeLessThanOrEqual(longest);
  });
});

describe("rolesWith (política única)", () => {
  it("deriva os papéis de can()", () => {
    expect(rolesWith("ops.area")).toEqual(["foode_ops"]);
    expect(rolesWith("store.members")).toEqual(["owner"]);
    expect(rolesWith("orders.update_status")).toEqual(["owner", "operator"]);
  });
});

describe("randomToken", () => {
  it("gera tokens alfanuméricos do tamanho pedido e distintos", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(randomToken(8)).toHaveLength(8);
  });
});
