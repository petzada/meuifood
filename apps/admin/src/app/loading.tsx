import { OutlineContainer } from "@foode/ui";

export default function Loading() {
  return (
    <main className="min-h-[100dvh] px-4 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-5xl" aria-busy="true" aria-label="Carregando Painel">
        <div className="h-8 w-64 animate-pulse rounded-xl bg-[var(--color-primary-soft)] motion-reduce:animate-none" />
        <OutlineContainer className="mt-8 space-y-4 p-6">
          <div className="h-5 w-40 animate-pulse rounded-xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none" />
          <div className="h-12 animate-pulse rounded-xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none" />
        </OutlineContainer>
      </div>
    </main>
  );
}
