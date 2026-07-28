import { BrandMark, OutlineContainer } from "@foode/ui";
import Image from "next/image";
import { redirect } from "next/navigation";

import logo from "../../../../public/images/logo.png";
import { createClient } from "../lib/supabase/server";

type StaffRole = "owner" | "operator";

export function PanelShell({ role }: { role: StaffRole }) {
  return (
    <main className="min-h-[100dvh] md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--color-hairline)] px-4 py-4 md:border-b-0 md:border-r md:px-6 md:py-7">
        <div className="flex items-center justify-between md:block">
          <BrandMark>
            <Image src={logo} alt="Foode Delivery" width={112} height={112} priority />
          </BrandMark>
          <p className="text-sm font-bold text-[var(--color-muted)] md:mt-8">Painel Foode</p>
        </div>
        <nav aria-label="Navegação do Painel" className="mt-4 md:mt-6">
          <a
            href="#pedidos"
            aria-current="page"
            className="flex min-h-12 items-center rounded-full bg-[var(--color-primary)] px-5 font-bold text-white"
          >
            Pedidos
          </a>
          {role === "owner" ? (
            <div className="mt-2 grid gap-1 text-sm font-bold text-[var(--color-body)]">
              <a className="min-h-11 rounded-full px-5 py-3" href="#cardapio">Cardápio</a>
              <a className="min-h-11 rounded-full px-5 py-3" href="#equipe">Equipe</a>
              <a className="min-h-11 rounded-full px-5 py-3" href="#configuracoes">Configurações</a>
            </div>
          ) : null}
        </nav>
      </aside>

      <section id="pedidos" className="px-4 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-bold text-[var(--color-primary-active)]">Visão inicial</p>
          <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            A operação da sua Loja começa aqui.
          </h1>
          <p className="mt-3 max-w-[56ch] leading-relaxed text-[var(--color-body)]">
            O shell do Painel está pronto para receber a fila de Pedidos e as próximas áreas do MVP.
          </p>

          <OutlineContainer className="mt-8 p-6 md:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-ink)]">Pedidos</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">Nenhuma operação configurada neste bootstrap.</p>
              </div>
              <span className="w-fit rounded-full border border-[var(--color-hairline)] px-4 py-2 text-sm font-bold text-[var(--color-muted)]">
                Estrutura inicial
              </span>
            </div>
          </OutlineContainer>
        </div>
      </section>
    </main>
  );
}

function apiUrl() {
  const value = process.env.API_URL?.trim();
  if (!value) throw new Error("API_URL_is_required");
  return value;
}

export default async function AdminHome() {
  const supabase = await createClient();
  const [{ error: claimsError }, { data }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ]);
  if (claimsError || !data.session) redirect("/entrar");

  const response = await fetch(new URL("/staff/context", apiUrl()), {
    cache: "no-store",
    headers: { authorization: `Bearer ${data.session.access_token}` },
  });
  if (response.status === 401 || response.status === 403) {
    redirect("/entrar?erro=acesso");
  }
  if (!response.ok) throw new Error("staff_context_request_failed");

  const payload = (await response.json()) as {
    context?: { role?: string; storeId?: string };
  };
  if (
    !payload.context?.storeId ||
    (payload.context.role !== "owner" && payload.context.role !== "operator")
  ) {
    throw new Error("staff_context_response_invalid");
  }
  return <PanelShell role={payload.context.role} />;
}
