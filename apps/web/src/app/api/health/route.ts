import { apiFetch } from "../../../lib/api";

// Smoke do deploy: prova o Worker do Storefront e o service binding para a api.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await apiFetch("/health");
    const api: unknown = await response.json();
    return Response.json(
      { status: response.ok ? "ok" : "degraded", service: "web", api },
      {
        status: response.ok ? 200 : 503,
      },
    );
  } catch {
    return Response.json({ status: "degraded", service: "web", api: null }, { status: 503 });
  }
}
