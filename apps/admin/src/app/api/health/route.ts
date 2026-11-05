import { painelApi } from "../../../lib/painel-api";

// Smoke do deploy: prova o Worker do Painel e o RPC até a api pelo service binding.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const api = await (await painelApi()).health();
    const ok = api.status === "ok";
    return Response.json(
      { status: ok ? "ok" : "degraded", service: "admin", api },
      {
        status: ok ? 200 : 503,
      },
    );
  } catch {
    return Response.json({ status: "degraded", service: "admin", api: null }, { status: 503 });
  }
}
