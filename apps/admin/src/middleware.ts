// `middleware.ts` (edge), não `proxy.ts`: no Next 16 o proxy roda em Node, e o OpenNext
// não suporta Node Middleware.
import type { NextRequest } from "next/server";

import { refreshSupabaseSession } from "./lib/supabase/proxy";

export function middleware(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
