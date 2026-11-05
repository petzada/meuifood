import { requirePermission } from "../../lib/session";
import { storefrontOrigin } from "../../lib/storefront-origin";
import { cancelOrder, transitionOrder } from "./pedidos/actions";
import { QueueApp } from "./pedidos/_components/queue-app";

// Home do Painel: fila de Pedidos (Ticket 24b) para Dono e Operador. A lista chega por polling
// pelo route handler `/api/pedidos`; a guarda `requirePermission("orders.view")` fica.
export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const session = await requirePermission("orders.view");
  const store = session.activeStore;
  if (!store || session.role === "foode_ops") return null;
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
