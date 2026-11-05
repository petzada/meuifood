import { OutlineContainer } from "@foode/ui";

import { requirePermission } from "../../../lib/session";

// Área Ops (papel global `foode_ops`). Os tickets de Lojas, Planos, taxas e repasses
// acrescentam as telas aqui; a guarda `requirePermission("ops.area")` fica.
export default async function OpsPage() {
  const session = await requirePermission("ops.area");
  return (
    <section className="mx-auto max-w-5xl">
      <p className="text-sm font-bold text-[var(--color-primary-active)]">Ops Foode</p>
      <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
        Olá, {session.user.name}.
      </h1>
      <p className="mt-3 max-w-[56ch] leading-relaxed text-[var(--color-body)]">
        Cadastro de Lojas, convites de Donos, Planos, taxas e repasses chegam aqui nos próximos
        passos.
      </p>
      <OutlineContainer className="mt-8 p-6 md:p-8">
        <h2 className="text-xl font-bold text-[var(--color-ink)]">Lojas</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Nenhuma Loja cadastrada ainda.</p>
      </OutlineContainer>
    </section>
  );
}
