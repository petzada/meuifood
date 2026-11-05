import { painelRead } from "../../../lib/painel-rpc";
import { requirePermission } from "../../../lib/session";
import { turnstileSiteKey } from "../../../lib/turnstile";
import { TeamPanel } from "./_components/team-panel";
import { inviteOperator, removeMember, resendInvite } from "./actions";

// `/equipe` (feedback do Dono, item 9; EQP-01): só o Dono (`store.members`). Lista a equipe da
// Loja ativa com a situação de cada membro, convida Operador por e-mail, reenvia o convite de quem
// ainda não definiu senha e remove acesso com confirmação que nomeia a pessoa.
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requirePermission("store.members");
  const members = await painelRead("a equipe", (api, caller) => api.listMembers(caller));
  return (
    <section className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-sm font-bold text-[var(--color-muted)]">Loja</p>
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
          Equipe
        </h1>
        <p className="mt-2 max-w-[60ch] leading-relaxed text-[var(--color-body)]">
          Operadores veem e atualizam a fila de Pedidos e podem pausar a Loja. Cardápio,
          Configurações, Cupons e Equipe ficam só com o Dono.
        </p>
      </header>
      <TeamPanel
        currentUserId={session.user.id}
        invite={inviteOperator}
        members={members}
        remove={removeMember}
        resend={resendInvite}
        siteKey={turnstileSiteKey()}
      />
    </section>
  );
}
