// Painel de Equipe (vindo da home antiga). Fica fora da navegação até o ticket que o liga
// às RPCs `listMembers`/`inviteMember`/`removeMember` (as actions ainda são do Supabase).
import { OutlineContainer } from "@foode/ui";
import type { MembershipRole } from "@foode/shared";

import { inviteOperator, removeOperator } from "./actions";
import { SubmitButton } from "./submit-button";

export type TeamMember = {
  email: string | null;
  id: string;
  role: MembershipRole;
  userId: string;
};

export type TeamFeedback = "acesso-removido" | "convite-enviado" | "convite-erro" | "remocao-erro";

export const teamFeedbackMessages: Record<TeamFeedback, string> = {
  "acesso-removido": "Acesso do Operador removido.",
  "convite-enviado": "Convite enviado e acesso criado.",
  "convite-erro": "Não foi possível convidar este Operador.",
  "remocao-erro": "Não foi possível remover este acesso.",
};

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
      <h2 className="text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">Equipe</h2>
      <p className="mt-2 max-w-[60ch] text-[var(--color-body)]">
        Convide Operadores para cuidar dos Pedidos. Configurações e dados financeiros continuam
        restritos ao Dono.
      </p>

      {feedback ? (
        <p
          role={feedback.endsWith("erro") ? "alert" : "status"}
          className="mt-5 rounded-xl border border-[var(--color-hairline)] px-4 py-3 text-sm font-bold text-[var(--color-body)]"
        >
          {teamFeedbackMessages[feedback]}
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
