import { OutlineContainer } from "@foode/ui";

// Skeleton no formato do gestor (T-04): cabeçalho, coluna de categorias e lista de itens.
const bar = "animate-pulse rounded-xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none";

export default function CardapioLoading() {
  return (
    <section className="mx-auto max-w-6xl" aria-busy="true" aria-label="Carregando o Cardápio">
      <div className={`h-4 w-12 ${bar}`} />
      <div className={`mt-3 h-8 w-40 ${bar}`} />
      <div className={`mt-3 h-4 w-72 ${bar}`} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <OutlineContainer className="space-y-3 p-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`h-14 ${bar}`} />
          ))}
        </OutlineContainer>
        <OutlineContainer className="space-y-3 p-6">
          <div className={`h-7 w-48 ${bar}`} />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={`h-24 ${bar}`} />
          ))}
        </OutlineContainer>
      </div>
    </section>
  );
}
