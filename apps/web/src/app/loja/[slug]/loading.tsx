// Skeleton outline com as dimensões do Cardápio (G9), sem fill nem sombra.
export default function StorefrontLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Carregando o Cardápio"
      className="min-h-dvh bg-[var(--color-canvas)]"
    >
      <header className="border-b border-[var(--color-hairline)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 md:px-8">
          <span className="foode-skeleton size-14 rounded-2xl" />
          <span className="grid flex-1 gap-2">
            <span className="foode-skeleton h-3 w-16" />
            <span className="foode-skeleton h-6 w-48" />
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-4 md:px-8">
        <span className="foode-skeleton h-4 w-32" />
        <span className="foode-skeleton mt-2 h-12 w-full rounded-xl" />
      </div>
      <div className="mx-auto grid max-w-3xl gap-3 px-4 pt-8 md:px-8">
        <span className="foode-skeleton h-6 w-28" />
        {Array.from({ length: 4 }, (_, index) => (
          <span className="foode-outline flex items-start gap-3 p-3" key={index}>
            <span className="grid flex-1 gap-2">
              <span className="foode-skeleton h-4 w-2/3" />
              <span className="foode-skeleton h-3 w-full" />
              <span className="foode-skeleton h-4 w-20" />
            </span>
            <span className="foode-skeleton size-20 rounded-2xl" />
          </span>
        ))}
      </div>
    </main>
  );
}
