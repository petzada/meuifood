import { beforeEach, describe, expect, it, vi } from "vitest";

import { ids } from "../storefront/fixtures";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

const apiFetch = vi.fn<ApiFetch>();
let bindingFailure: ApiFetch | null = null;

vi.mock("../../../../lib/api", () => ({
  apiFetch: (...args: [string, RequestInit?]) => (bindingFailure ?? apiFetch)(...args),
}));

const lines = [{ additionalIds: [], complementSelections: {}, itemId: ids.soda, quantity: 2 }];

function post(body: unknown, slug = "lanchonete-do-ze") {
  return import("./route").then(({ POST }) =>
    POST(
      new Request("https://web.test/loja/x/carrinho", {
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { params: Promise.resolve({ slug }) },
    ),
  );
}

describe("POST /loja/[slug]/carrinho", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    bindingFailure = null;
  });

  it("valida o corpo com o contrato e encaminha só ids e quantidades", async () => {
    apiFetch.mockResolvedValue(
      Response.json({
        lines: [{ itemId: ids.soda, subtotalCents: 1200 }],
        ok: true,
        subtotalCents: 1200,
      }),
    );
    const response = await post({ lines, priceCents: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lines: [{ itemId: ids.soda, subtotalCents: 1200 }],
      ok: true,
      subtotalCents: 1200,
    });
    const [path, init] = apiFetch.mock.calls[0]!;
    expect(path).toBe("/storefront/lojas/lanchonete-do-ze/carrinho");
    expect(JSON.parse(String(init?.body))).toEqual({ lines });
  });

  it("rejeita corpo inválido sem chamar a api", async () => {
    expect((await post({ lines: [] })).status).toBe(400);
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ lines }, "Slug Inválido")).status).toBe(404);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("repassa a linha inválida apontada pela api", async () => {
    apiFetch.mockResolvedValue(
      Response.json({
        error: { code: "item_unavailable", itemId: ids.soda },
        lineIndex: 0,
        ok: false,
      }),
    );
    const response = await post({ lines });
    expect(await response.json()).toMatchObject({ lineIndex: 0, ok: false });
  });

  it("api sem a rota (501) vira 502", async () => {
    apiFetch.mockResolvedValue(Response.json({ error: "not_implemented" }, { status: 501 }));
    expect((await post({ lines })).status).toBe(502);
  });

  it("resposta fora do contrato vira 502", async () => {
    apiFetch.mockResolvedValue(Response.json({ ok: true }));
    expect((await post({ lines })).status).toBe(502);
  });

  it("binding indisponível vira 502", async () => {
    // Função simples, não spy: o spy do vitest registra a rejeição como erro do teste.
    bindingFailure = () => Promise.reject(new Error("binding"));
    const response = await post({ lines });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "quote_unavailable" });
  });
});
