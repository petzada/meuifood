import { OutlineContainer } from "@foode/ui";

// Carregando DENTRO da moldura do Painel (item 8 do feedback): ao clicar num item do menu o
// conteúdo troca na hora por este skeleton e a sidebar continua; antes não havia boundary abaixo
// do layout e a tela antiga ficava parada 1,5–2,5 s (Pedidos: sessão + Loja + onboarding),
// parecendo que "Pedidos não carrega" — o Dono clicava de novo e reiniciava a navegação.
export default function PainelLoading() {
  return (
    <section className="mx-auto max-w-7xl" aria-busy="true" aria-label="Carregando">
      <div className="h-4 w-32 animate-pulse rounded-xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none" />
      <div className="mt-3 h-8 w-56 animate-pulse rounded-xl bg-[var(--color-primary-soft)] motion-reduce:animate-none" />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <OutlineContainer key={key} className="space-y-3 p-4">
            <div className="h-4 w-24 animate-pulse rounded-xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none" />
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-hairline-soft)] motion-reduce:animate-none" />
          </OutlineContainer>
        ))}
      </div>
    </section>
  );
}
