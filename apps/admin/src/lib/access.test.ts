import type { SessionCtx } from "@foode/shared/auth";
import { describe, expect, it } from "vitest";

import { decideAccess, navFor, resolveRole, safeNext } from "./access";

const store = (role: "owner" | "operator", id = "loja-1"): SessionCtx["stores"][number] => ({
  id,
  slug: id,
  name: `Loja ${id}`,
  status: "active",
  role,
});

function session(partial: Partial<SessionCtx> & { platformRole?: "foode_ops" | null }): SessionCtx {
  const { platformRole = null, ...rest } = partial;
  return {
    user: { id: "u1", email: "dono@example.com", name: "Dono", platformRole },
    sessionExpiresAt: "2030-01-01T00:00:00.000Z",
    activeStore: null,
    stores: [],
    ...rest,
  };
}

const owner = session({ activeStore: store("owner"), stores: [store("owner")] });
const operator = session({ activeStore: store("operator"), stores: [store("operator")] });
const ops = session({ platformRole: "foode_ops" });

describe("decideAccess (middleware de papéis)", () => {
  it("sem sessão: rotas públicas passam e o resto vai para /entrar com ?next", () => {
    expect(decideAccess("/entrar", "", null)).toBeNull();
    expect(decideAccess("/definir-senha", "?token=abc", null)).toBeNull();
    expect(decideAccess("/", "", null)).toBe("/entrar");
    expect(decideAccess("/cardapio", "?aba=itens", null)).toBe(
      "/entrar?next=%2Fcardapio%3Faba%3Ditens",
    );
  });

  it("Operador só vê Pedidos: outras áreas voltam para a home sem página de erro", () => {
    expect(decideAccess("/", "", operator)).toBeNull();
    expect(decideAccess("/cardapio", "", operator)).toBe("/");
    expect(decideAccess("/equipe/convidar", "", operator)).toBe("/");
    expect(decideAccess("/ops", "", operator)).toBe("/");
  });

  it("Ops só entra em /ops", () => {
    expect(decideAccess("/ops", "", ops)).toBeNull();
    expect(decideAccess("/ops/lojas/nova", "", ops)).toBeNull();
    expect(decideAccess("/", "", ops)).toBe("/ops");
    expect(decideAccess("/cardapio", "", ops)).toBe("/ops");
    expect(decideAccess("/selecionar-loja", "", ops)).toBe("/ops");
  });

  it("Dono acessa a Loja dele e não o /ops", () => {
    expect(decideAccess("/", "", owner)).toBeNull();
    expect(decideAccess("/cardapio", "", owner)).toBeNull();
    expect(decideAccess("/equipe", "", owner)).toBeNull();
    expect(decideAccess("/configuracoes/delivery", "", owner)).toBeNull();
    expect(decideAccess("/ops", "", owner)).toBe("/");
  });

  it("autenticado nas telas de auth volta para a home do papel", () => {
    expect(decideAccess("/entrar", "", owner)).toBe("/");
    expect(decideAccess("/entrar", "", ops)).toBe("/ops");
  });

  it("sem Loja ativa com várias Lojas: só o seletor", () => {
    const multi = session({ stores: [store("owner", "a"), store("operator", "b")] });
    expect(decideAccess("/", "", multi)).toBe("/selecionar-loja");
    expect(decideAccess("/selecionar-loja", "", multi)).toBeNull();
    expect(decideAccess("/entrar", "", multi)).toBe("/selecionar-loja");
  });

  it("sem nenhuma Loja: só a tela de sem acesso", () => {
    const none = session({});
    expect(decideAccess("/", "", none)).toBe("/sem-acesso");
    expect(decideAccess("/sem-acesso", "", none)).toBeNull();
  });

  it("rota desconhecida com sessão e papel passa (404 do Next)", () => {
    expect(decideAccess("/nao-existe", "", owner)).toBeNull();
  });
});

describe("resolveRole e navegação", () => {
  it("Ops vence a membership", () => {
    expect(resolveRole(session({ platformRole: "foode_ops", activeStore: store("owner") }))).toBe(
      "foode_ops",
    );
    expect(resolveRole(owner)).toBe("owner");
    expect(resolveRole(session({}))).toBeNull();
  });

  it("navegação segue a política de cada papel", () => {
    expect(navFor("operator").map((item) => item.label)).toEqual(["Pedidos"]);
    expect(navFor("foode_ops").map((item) => item.href)).toEqual(["/ops"]);
    expect(navFor("owner").map((item) => item.label)).toEqual([
      "Pedidos",
      "Cardápio",
      "Configurações",
      "Equipe",
    ]);
  });
});

describe("safeNext", () => {
  it("só aceita caminho relativo do Painel", () => {
    expect(safeNext("/cardapio", "/")).toBe("/cardapio");
    expect(safeNext("https://evil.example", "/")).toBe("/");
    expect(safeNext("//evil.example", "/")).toBe("/");
    expect(safeNext("/api/auth/sign-out", "/")).toBe("/");
    expect(safeNext(undefined, "/ops")).toBe("/ops");
  });
});
