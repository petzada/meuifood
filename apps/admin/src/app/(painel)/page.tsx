import { can } from "@foode/shared/auth";

import { painelRpc } from "../../lib/painel-rpc";
import { requirePermission } from "../../lib/session";
import { storefrontOrigin } from "../../lib/storefront-origin";
import { acknowledgeReady, answerProfile } from "./onboarding/actions";
import { OwnerChecklistCard } from "./onboarding/_components/owner-checklist";
import { ProfileQuestions } from "./onboarding/_components/profile-questions";
import { cancelOrder, transitionOrder } from "./pedidos/actions";
import { QueueApp } from "./pedidos/_components/queue-app";

// Home do Painel: fila de Pedidos (Ticket 24b) para Dono e Operador. Para o Dono, antes vêm as
// duas perguntas de perfil (1º acesso, Ticket 28) e, no topo, o checklist enquanto a Loja não
// estiver pronta (ONB-01). A lista chega por polling pelo route handler `/api/pedidos`.
export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const session = await requirePermission("orders.view");
  const store = session.activeStore;
  if (!store || session.role === "foode_ops") return null;

  // Operador não vê onboarding; falha da RPC não derruba a fila (segue sem o checklist).
  const onboarding = can(session.role, "store.settings")
    ? await painelRpc((api, caller) => api.onboardingGet(caller))
    : null;
  const state = onboarding?.ok ? onboarding.data : null;

  if (state && !state.profileAnswered) {
    return <ProfileQuestions action={answerProfile} storeName={store.name} />;
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--color-primary-strong)]">{store.name}</p>
          <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            Pedidos
          </h1>
        </div>
      </header>
      {state ? (
        <div className="mt-6">
          <OwnerChecklistCard
            acknowledgeReady={acknowledgeReady}
            checklist={state.checklist}
            slug={state.slug}
            storeUrl={state.storeUrl}
          />
        </div>
      ) : null}
      <div className="mt-6">
        <QueueApp
          cancel={cancelOrder}
          role={session.role}
          storefrontOrigin={storefrontOrigin()}
          storeName={store.name}
          storeSlug={store.slug}
          transition={transitionOrder}
          userId={session.user.id}
        />
      </div>
    </section>
  );
}
