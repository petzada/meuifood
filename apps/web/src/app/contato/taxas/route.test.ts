// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;
const apiFetch = vi.fn<ApiFetch>();
vi.mock("../../../lib/api", () => ({
  apiFetch: (...args: [string, RequestInit?]) => apiFetch(...args),
}));

const { GET } = await import("./route");

const fees = [
  { method: "pix", cardMode: null, percentBps: 99, fixedCents: 0 },
  { method: "credit", cardMode: "rapido", percentBps: 599, fixedCents: 50 },
];

beforeEach(() => {
  apiFetch.mockReset();
});

describe("GET /contato/taxas", () => {
  it("repassa a tabela padrão da api com cache curto", async () => {
    apiFetch.mockResolvedValue(Response.json({ fees }));
    const response = await GET();
    expect(apiFetch.mock.calls[0]![0]).toBe("/storefront/taxas");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    await expect(response.json()).resolves.toEqual({ fees });
  });

  it("corpo fora do contrato, erro ou api fora = lista vazia sem cache", async () => {
    apiFetch.mockResolvedValueOnce(Response.json({ fees: [{ method: "boleto" }] }));
    apiFetch.mockResolvedValueOnce(new Response("x", { status: 500 }));
    apiFetch.mockRejectedValueOnce(new Error("binding"));
    for (let i = 0; i < 3; i += 1) {
      const response = await GET();
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({ fees: [] });
    }
  });
});
