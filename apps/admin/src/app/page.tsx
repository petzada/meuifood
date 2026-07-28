import { BrandMark, OutlineContainer } from "@foode/ui";
import Image from "next/image";

import logo from "../../../../public/images/logo.png";

export default function AdminHome() {
  return (
    <main className="min-h-[100dvh] md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--color-hairline)] px-4 py-4 md:border-b-0 md:border-r md:px-6 md:py-7">
        <div className="flex items-center justify-between md:block">
          <BrandMark>
            <Image src={logo} alt="Foode Delivery" width={112} height={112} priority />
          </BrandMark>
          <p className="text-sm font-bold text-[var(--color-muted)] md:mt-8">Painel Foode</p>
        </div>
        <nav aria-label="Navegação do Painel" className="mt-4 md:mt-6">
          <a
            href="#pedidos"
            aria-current="page"
            className="flex min-h-12 items-center rounded-full bg-[var(--color-primary)] px-5 font-bold text-white"
          >
            Pedidos
          </a>
        </nav>
      </aside>

      <section id="pedidos" className="px-4 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-bold text-[var(--color-primary-active)]">Visão inicial</p>
          <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            A operação da sua Loja começa aqui.
          </h1>
          <p className="mt-3 max-w-[56ch] leading-relaxed text-[var(--color-body)]">
            O shell do Painel está pronto para receber a fila de Pedidos e as próximas áreas do MVP.
          </p>

          <OutlineContainer className="mt-8 p-6 md:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-ink)]">Pedidos</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">Nenhuma operação configurada neste bootstrap.</p>
              </div>
              <span className="w-fit rounded-full border border-[var(--color-hairline)] px-4 py-2 text-sm font-bold text-[var(--color-muted)]">
                Estrutura inicial
              </span>
            </div>
          </OutlineContainer>
        </div>
      </section>
    </main>
  );
}
