import { OutlineContainer } from "@foode/ui";

// Skeleton no formato do relatório (T-04): cabeçalho, atalhos de período, 4 números e tabelas.
const bar = "animate-pulse rounded-xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none";

export default function ReportsLoading() {
  return (
    <section className="mx-auto max-w-6xl" aria-busy="true" aria-label="Carregando Relatórios">
      <div className={`h-4 w-20 ${bar}`} />
      <div className={`mt-3 h-8 w-40 ${bar}`} />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`h-11 w-24 rounded-full ${bar}`} />
        ))}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <OutlineContainer key={i} className="p-5">
            <div className={`h-4 w-20 ${bar}`} />
            <div className={`mt-3 h-8 w-28 ${bar}`} />
            <div className={`mt-2 h-4 w-36 ${bar}`} />
          </OutlineContainer>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <OutlineContainer key={i} className="space-y-3 p-5">
            <div className={`h-6 w-32 ${bar}`} />
            <div className={`h-10 ${bar}`} />
            <div className={`h-10 ${bar}`} />
          </OutlineContainer>
        ))}
      </div>
    </section>
  );
}
