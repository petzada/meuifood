// Slug inexistente ou Loja fora de `active` (spec: "Cardápio indisponível").
export default function StorefrontNotFound() {
  return (
    <main className="min-h-dvh bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <div className="foode-outline p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
            Foode Delivery
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
            Cardápio indisponível
          </h1>
          <p className="mt-2 max-w-[48ch] text-[var(--color-body)]">
            Esta Loja não está recebendo pedidos agora. Confira o link ou volte mais tarde.
          </p>
        </div>
      </div>
    </main>
  );
}
