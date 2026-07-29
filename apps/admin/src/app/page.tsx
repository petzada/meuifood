import { BrandMark, OutlineContainer } from "@foode/ui";
import { membershipRoleSchema, type MembershipRole } from "@foode/shared";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import logo from "../../../../public/images/logo.png";
import { createClient } from "../lib/supabase/server";
import {
  MenuPanel,
  menuFeedbackMessages,
  type MenuCategory,
  type MenuFeedback,
  type MenuItem,
} from "./menu/menu-panel";
import type {
  Additional,
  ComplementGroup,
} from "./menu/item-customization-panel";
import {
  OperationPanel,
  operationFeedbackMessages,
  type OperationFeedback,
  type StoreOperationConfig,
} from "./operation/operation-panel";
import { OrdersQueue } from "./orders/orders-queue";
import { inviteOperator, removeOperator } from "./team/actions";
import { SubmitButton } from "./team/submit-button";

type TeamMember = {
  email: string | null;
  id: string;
  role: MembershipRole;
  userId: string;
};

type TeamFeedback =
  | "acesso-removido"
  | "convite-enviado"
  | "convite-erro"
  | "remocao-erro";

const feedbackMessages: Record<TeamFeedback, string> = {
  "acesso-removido": "Acesso do Operador removido.",
  "convite-enviado": "Convite enviado e acesso criado.",
  "convite-erro": "Não foi possível convidar este Operador.",
  "remocao-erro": "Não foi possível remover este acesso.",
};

export function PanelShell({
  menu,
  operation,
  orders,
  role,
  team,
}: {
  menu?: ReactNode;
  operation?: ReactNode;
  orders?: ReactNode;
  role: MembershipRole;
  team?: ReactNode;
}) {
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
              <a className="min-h-11 rounded-full px-5 py-3" href="#funcionamento">Funcionamento</a>
              <a className="min-h-11 rounded-full px-5 py-3" href="#equipe">Equipe</a>
              <a className="min-h-11 rounded-full px-5 py-3" href="#configuracoes">Configurações</a>
            </div>
          ) : null}
        </nav>
      </aside>

      <div className="px-4 py-8 md:px-10 md:py-10">
        <section id="pedidos" className="mx-auto max-w-5xl">
          <p className="text-sm font-bold text-[var(--color-primary-active)]">Visão inicial</p>
          <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            A operação da sua Loja começa aqui.
          </h1>
          <p className="mt-3 max-w-[56ch] leading-relaxed text-[var(--color-body)]">
            {role === "owner"
              ? "Acompanhe os Pedidos e mantenha Cardápio e Equipe sob controle."
              : "Acompanhe os Pedidos e atualize o andamento da operação."}
          </p>

          {orders ?? (
            <OutlineContainer className="mt-8 p-6 md:p-8">
              <h2 className="text-xl font-bold text-[var(--color-ink)]">Pedidos</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Nenhum Pedido em andamento.
              </p>
            </OutlineContainer>
          )}
        </section>
        {menu}
        {operation}
        {team}
      </div>
    </main>
  );
}

export function TeamPanel({
  feedback,
  members,
}: {
  feedback?: TeamFeedback | undefined;
  members: TeamMember[];
}) {
  const operators = members.filter(({ role }) => role === "operator");
  return (
    <section id="equipe" className="mx-auto mt-12 max-w-5xl scroll-mt-8">
      <h2 className="text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
        Equipe
      </h2>
      <p className="mt-2 max-w-[60ch] text-[var(--color-body)]">
        Convide Operadores para cuidar dos Pedidos. Configurações e dados financeiros continuam restritos ao Dono.
      </p>

      {feedback ? (
        <p
          role={feedback.endsWith("erro") ? "alert" : "status"}
          className="mt-5 rounded-xl border border-[var(--color-hairline)] px-4 py-3 text-sm font-bold text-[var(--color-body)]"
        >
          {feedbackMessages[feedback]}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
        <OutlineContainer className="p-5 md:p-6">
          <h3 className="text-lg font-bold text-[var(--color-ink)]">Acessos ativos</h3>
          <div className="mt-4 grid gap-3">
            {members.map((member) => (
              <div
                className="grid gap-3 rounded-2xl border border-[var(--color-hairline-soft)] p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                key={member.id}
              >
                <div className="min-w-0">
                  <p className="font-bold text-[var(--color-ink)]">
                    {member.role === "owner" ? "Dono" : "Operador"}
                  </p>
                  <p className="truncate text-sm text-[var(--color-muted)]">
                    {member.email ?? `Identidade ${member.userId.slice(0, 8)}`}
                  </p>
                </div>
                {member.role === "operator" ? (
                  <form action={removeOperator}>
                    <input type="hidden" name="membershipId" value={member.id} />
                    <SubmitButton variant="secondary" className="w-full sm:w-auto">
                      Remover acesso
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
            {operators.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--color-hairline)] p-4 text-sm text-[var(--color-muted)]">
                Nenhum Operador convidado. Use o formulário ao lado para criar o primeiro acesso.
              </p>
            ) : null}
          </div>
        </OutlineContainer>

        <OutlineContainer className="h-fit p-5 md:p-6">
          <h3 className="text-lg font-bold text-[var(--color-ink)]">Convidar Operador</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
            A pessoa receberá um link para definir a senha do Painel.
          </p>
          <form action={inviteOperator} className="mt-5 space-y-4">
            <label className="block text-sm font-bold text-[var(--color-ink)]">
              E-mail
              <input
                autoComplete="email"
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                name="email"
                placeholder="operador@loja.com.br"
                required
                type="email"
              />
            </label>
            <SubmitButton className="w-full">Enviar convite</SubmitButton>
          </form>
        </OutlineContainer>
      </div>
    </section>
  );
}

function apiUrl() {
  const value = process.env.API_URL?.trim();
  if (!value) throw new Error("API_URL_is_required");
  return value;
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{
    cardapio?: string;
    equipe?: string;
    funcionamento?: string;
  }>;
}) {
  const supabase = await createClient();
  const { error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) redirect("/entrar");
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/entrar");

  const headers = { authorization: `Bearer ${data.session.access_token}` };
  const contextResponse = await fetch(new URL("/team/context", apiUrl()), {
    cache: "no-store",
    headers,
  });
  if (contextResponse.status === 401 || contextResponse.status === 403) {
    redirect("/entrar?erro=acesso");
  }
  if (!contextResponse.ok) throw new Error("membership_context_request_failed");

  const payload = (await contextResponse.json()) as {
    context?: { role?: unknown; storeId?: string };
  };
  const role = membershipRoleSchema.safeParse(payload.context?.role);
  if (!payload.context?.storeId || !role.success) {
    throw new Error("membership_context_response_invalid");
  }

  let menu: ReactNode = undefined;
  let operation: ReactNode = undefined;
  let team: ReactNode = undefined;
  if (role.data === "owner") {
    const { cardapio, equipe, funcionamento } = await searchParams;
    const menuResponse = await fetch(new URL("/menu", apiUrl()), {
      cache: "no-store",
      headers,
    });
    if (!menuResponse.ok) throw new Error("menu_request_failed");
    const menuPayload = (await menuResponse.json()) as {
      additionals?: Additional[];
      categories?: MenuCategory[];
      complementGroups?: ComplementGroup[];
      items?: MenuItem[];
    };
    if (
      !Array.isArray(menuPayload.categories) ||
      !Array.isArray(menuPayload.items) ||
      !Array.isArray(menuPayload.complementGroups) ||
      !Array.isArray(menuPayload.additionals)
    ) {
      throw new Error("menu_response_invalid");
    }
    const menuFeedback = Object.hasOwn(menuFeedbackMessages, cardapio ?? "")
      ? (cardapio as MenuFeedback)
      : undefined;
    menu = (
      <MenuPanel
        additionals={menuPayload.additionals}
        categories={menuPayload.categories}
        complementGroups={menuPayload.complementGroups}
        feedback={menuFeedback}
        items={menuPayload.items}
      />
    );

    const operationResponse = await fetch(new URL("/operation", apiUrl()), {
      cache: "no-store",
      headers,
    });
    if (!operationResponse.ok) {
      throw new Error("operation_request_failed");
    }
    const operationPayload = (await operationResponse.json()) as {
      operation?: StoreOperationConfig;
    };
    if (
      typeof operationPayload.operation?.paused !== "boolean" ||
      !Array.isArray(operationPayload.operation.periods)
    ) {
      throw new Error("operation_response_invalid");
    }
    const operationFeedback = Object.hasOwn(
      operationFeedbackMessages,
      funcionamento ?? "",
    )
      ? (funcionamento as OperationFeedback)
      : undefined;
    operation = (
      <OperationPanel
        feedback={operationFeedback}
        operation={operationPayload.operation}
      />
    );

    const membersResponse = await fetch(new URL("/team/members", apiUrl()), {
      cache: "no-store",
      headers,
    });
    if (!membersResponse.ok) throw new Error("team_members_request_failed");
    const membersPayload = (await membersResponse.json()) as {
      members?: TeamMember[];
    };
    if (!Array.isArray(membersPayload.members)) {
      throw new Error("team_members_response_invalid");
    }
    const feedback = Object.hasOwn(feedbackMessages, equipe ?? "")
      ? (equipe as TeamFeedback)
      : undefined;
    team = <TeamPanel feedback={feedback} members={membersPayload.members} />;
  }

  return (
    <PanelShell
      menu={menu}
      operation={operation}
      orders={
        <OrdersQueue
          accessToken={data.session.access_token}
          apiUrl={apiUrl()}
        />
      }
      role={role.data}
      team={team}
    />
  );
}
