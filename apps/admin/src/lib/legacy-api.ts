// Ponte temporária das server actions antigas (cardápio, funcionamento, delivery, equipe),
// que ainda chamam a api antiga por `API_URL` + Bearer do Supabase. O Supabase saiu do
// admin no Ticket 22; o Bearer não existe mais. Até os tickets que portam cada área para as
// RPCs do `PainelApi`, a action confere a sessão Better Auth e falha de forma explícita.
import { requireSession } from "./session";

export function apiUrl() {
  const value = process.env.API_URL?.trim();
  if (!value) throw new Error("API_URL_is_required");
  return value;
}

export async function accessToken(): Promise<string> {
  await requireSession();
  throw new Error("legacy_api_not_ported");
}
