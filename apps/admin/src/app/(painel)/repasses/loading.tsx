import { OutlineContainer } from "@foode/ui";

// Skeleton no formato dos Repasses (T-04): cabeçalho, filtro, 5 totais e a tabela.
const bar = "animate-pulse rounded-xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none";

export default function PayoutsLoading() {
  return (
    <section className="mx-auto max-w-6xl" aria-busy="true" aria-label="Carregando Repasses">
      <div className={`h-4 w-20 ${bar}`} />
      <div className={`mt-3 h-8 w-40 ${bar}`} />
      <div className={`mt-6 h-11 w-96 max-w-full ${bar}`} />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <OutlineContainer key={i} className="p-4">
            <div className={`h-5 w-20 rounded-full ${bar}`} />
            <div className={`mt-3 h-7 w-24 ${bar}`} />
          </OutlineContainer>
        ))}
      </div>
      <OutlineContainer className="mt-6 space-y-3 p-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`h-10 ${bar}`} />
        ))}
      </OutlineContainer>
    </section>
  );
}
