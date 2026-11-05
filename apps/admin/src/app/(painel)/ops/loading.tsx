import { OutlineContainer } from "@foode/ui";

// Skeleton no formato do conteúdo (T-04), sem tela cheia.
const bar = "animate-pulse rounded-xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none";

export default function OpsLoading() {
  return (
    <section className="mx-auto max-w-6xl" aria-busy="true" aria-label="Carregando área Ops">
      <div className={`h-4 w-20 ${bar}`} />
      <div className={`mt-3 h-8 w-56 ${bar}`} />
      <div className={`mt-3 h-4 w-80 ${bar}`} />
      <OutlineContainer className="mt-8 space-y-4 p-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-12 ${bar}`} />
        ))}
      </OutlineContainer>
    </section>
  );
}
