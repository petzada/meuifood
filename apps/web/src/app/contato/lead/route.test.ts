// @vitest-environment node
import { describe, expect, it } from "vitest";

import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("https://foodedelivery.com.br/contato/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = {
  name: "Ana",
  whatsapp: "(11) 99999-1234",
  storeName: "Burger da Ana",
  city: "São Paulo",
  ordersPerDay: "10_a_50",
};

describe("POST /contato/lead", () => {
  it("responde 503 controlado com o lead válido (TODO(31-leads))", async () => {
    const response = await POST(post(valid));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, kind: "unavailable" });
    expect(typeof body.message).toBe("string");
  });

  it("devolve 400 com os erros por campo quando o contrato falha", async () => {
    const response = await POST(post({ ...valid, whatsapp: "1234", city: "" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.kind).toBe("invalid");
    expect(Object.keys(body.errors).sort()).toEqual(["city", "whatsapp"]);
  });

  it("devolve 400 quando o corpo não é JSON", async () => {
    const response = await POST(post("{nope"));
    expect(response.status).toBe(400);
  });
});
