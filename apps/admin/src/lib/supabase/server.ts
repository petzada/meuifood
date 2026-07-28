import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function publicEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_is_required`);
  return value;
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    publicEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    publicEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, options, value } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components não podem gravar cookies. O proxy renova a
            // sessão e persiste os cookies antes de renderizar a página.
          }
        },
      },
    },
  );
}
