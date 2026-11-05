import { describe, expect, it, vi } from "vitest";

import { createTurnstileVerifier, TURNSTILE_SITEVERIFY_URL } from "./turnstile";

const ENV = { TURNSTILE_SECRET_KEY: "segredo-turnstile" };

describe("createTurnstileVerifier", () => {
  it("aprova só com success: true e envia secret, token e IP", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true }));
    await expect(createTurnstileVerifier(ENV, fetcher).verify("tok", "203.0.113.7")).resolves.toBe(
      true,
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      secret: "segredo-turnstile",
      response: "tok",
      remoteip: "203.0.113.7",
    });
  });

  it("sem IP não envia remoteip", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true }));
    await createTurnstileVerifier(ENV, fetcher).verify("tok", null);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).not.toHaveProperty("remoteip");
  });

  it("falha fechada: success false, HTTP de erro, rede fora, JSON inválido", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
      async () => Response.json({ success: true }, { status: 500 }),
      async () => {
        throw new TypeError("offline");
      },
      async () => new Response("não é json"),
      async () => Response.json({ success: "true" }),
    ];
    for (const impl of cases) {
      const fetcher = vi.fn<typeof fetch>(impl);
      await expect(createTurnstileVerifier(ENV, fetcher).verify("tok", null)).resolves.toBe(false);
    }
  });

  it("token vazio, longo demais ou secret ausente: false sem chamar a rede", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true }));
    await expect(createTurnstileVerifier(ENV, fetcher).verify("", null)).resolves.toBe(false);
    await expect(
      createTurnstileVerifier(ENV, fetcher).verify("x".repeat(2049), null),
    ).resolves.toBe(false);
    await expect(createTurnstileVerifier({}, fetcher).verify("tok", null)).resolves.toBe(false);
    await expect(
      createTurnstileVerifier({ TURNSTILE_SECRET_KEY: "  " }, fetcher).verify("tok", null),
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
