import { OutlineContainer } from "@foode/ui";

import { requirePermission } from "../../lib/session";

// Home do Painel: Pedidos. O ticket de Pedidos (fila em tempo real) substitui o conteúdo;
// a guarda `requirePermission("orders.view")` fica.
export default async function PedidosPage() {
  const session = await requirePermission("orders.view");
  const store = session.activeStore;
  return (
    <section className="mx-auto max-w-5xl">
      <p className="text-sm font-bold text-[var(--color-primary-strong)]">
        {store ? store.name : "Pedidos"}
      </p>
      <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
        A operação da sua Loja começa aqui.
      </h1>
      <p className="mt-3 max-w-[56ch] leading-relaxed text-[var(--color-body)]">
        {session.role === "owner"
          ? "Acompanhe os Pedidos e mantenha Cardápio e Equipe sob controle."
          : "Acompanhe os Pedidos e atualize o andamento da operação."}
      </p>
      <OutlineContainer className="mt-8 p-6 md:p-8">
        <h2 className="text-xl font-bold text-[var(--color-ink)]">Pedidos</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Nenhum Pedido em andamento.</p>
      </OutlineContainer>
    </section>
  );
}
