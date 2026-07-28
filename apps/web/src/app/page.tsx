import {
  ArrowRight,
  Check,
  DeviceMobile,
  LinkSimple,
  Storefront,
} from "@phosphor-icons/react/dist/ssr";
import { BrandMark, Button, OutlineContainer } from "@foode/ui";
import Image from "next/image";

import heroPhoto from "../../../../public/images/hero-restaurante.png";
import logo from "../../../../public/images/logo.png";

const benefits = [
  "Cardápio e checkout no navegador",
  "Pedidos organizados no Painel",
  "Custo fixo e previsível",
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-4 md:px-8">
        <a
          href="#inicio"
          aria-label="Foode Delivery, início"
        >
          <BrandMark>
            <Image src={logo} alt="Foode Delivery" width={132} height={132} priority />
          </BrandMark>
        </a>
        <nav aria-label="Navegação principal" className="flex items-center gap-2 sm:gap-5">
          <a className="hidden text-sm font-bold text-[var(--color-body)] sm:block" href="#como-funciona">
            Como funciona
          </a>
          <Button href="#plano" className="min-h-11 px-4 text-sm">
            Ver plano
          </Button>
        </nav>
      </header>

      <section
        id="inicio"
        className="mx-auto grid min-h-[calc(100dvh-72px)] w-full max-w-7xl items-center gap-8 px-4 py-10 md:grid-cols-[0.9fr_1.1fr] md:px-8 md:py-14"
      >
        <div className="relative z-[1] max-w-xl">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.12em] text-[var(--color-primary-active)]">
            Feito para delivery local
          </p>
          <h1 className="text-balance text-[1.75rem] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--color-ink)]">
            Seu Canal próprio. Sua Loja mais perto.
          </h1>
          <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-[var(--color-body)] sm:text-lg">
            Cardápio, pedidos e gestão em um só lugar para sua loja vender direto pelo celular.
          </p>
          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button href="#plano">
              Começar com a Foode
              <ArrowRight aria-hidden size={18} weight="bold" />
            </Button>
            <span className="text-sm font-bold text-[var(--color-muted)]">A partir de R$ 179/mês</span>
          </div>
        </div>

        <div className="hero-photo relative min-h-[360px] overflow-hidden rounded-[var(--radius-container)] md:min-h-[540px]">
          <Image
            src={heroPhoto}
            alt="Comerciante preparando um pedido em seu restaurante"
            fill
            sizes="(max-width: 767px) 100vw, 55vw"
            className="object-cover object-center"
            priority
          />
        </div>
      </section>

      <section aria-label="Benefícios" className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-8">
        <OutlineContainer className="grid gap-5 p-6 md:grid-cols-[1.2fr_0.8fr] md:items-center md:p-8">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
              Venda direto, sem comissão por pedido.
            </h2>
            <p className="mt-2 max-w-[55ch] leading-relaxed text-[var(--color-body)]">
              A Loja divulga o próprio link. A Foode cuida da experiência do pedido e da rotina no Painel.
            </p>
          </div>
          <ul className="grid gap-3" role="list">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 font-bold text-[var(--color-body)]">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-active)]">
                  <Check aria-hidden size={16} weight="bold" />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </OutlineContainer>
      </section>

      <section id="como-funciona" className="border-y border-[var(--color-hairline)] py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 md:grid-cols-[0.8fr_1.2fr] md:px-8">
          <div className="max-w-md">
            <h2 className="text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
              Do link ao pedido, tudo mais simples.
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-body)]">
              Uma jornada curta para o Consumidor e uma operação clara para o Comerciante.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OutlineContainer className="bg-transparent p-6 sm:row-span-2">
              <LinkSimple aria-hidden size={30} className="text-[var(--color-primary)]" weight="bold" />
              <h3 className="mt-8 text-xl font-bold text-[var(--color-ink)]">Divulgue seu link</h3>
              <p className="mt-2 leading-relaxed text-[var(--color-body)]">
                Leve o Consumidor ao seu Canal próprio pelo WhatsApp, Instagram ou QR Code.
              </p>
            </OutlineContainer>
            <OutlineContainer className="bg-transparent p-6">
              <DeviceMobile aria-hidden size={28} className="text-[var(--color-primary)]" weight="bold" />
              <h3 className="mt-5 text-lg font-bold text-[var(--color-ink)]">Receba pelo navegador</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">Sem exigir instalação de aplicativo.</p>
            </OutlineContainer>
            <OutlineContainer className="bg-transparent p-6">
              <Storefront aria-hidden size={28} className="text-[var(--color-primary)]" weight="bold" />
              <h3 className="mt-5 text-lg font-bold text-[var(--color-ink)]">Organize no Painel</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">Acompanhe a operação da sua Loja.</p>
            </OutlineContainer>
          </div>
        </div>
      </section>

      <section id="plano" className="mx-auto w-full max-w-7xl px-4 py-16 md:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            Um plano direto para começar.
          </h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-[var(--color-body)]">
            Escolha a frequência. O Canal próprio e a experiência Foode são os mesmos.
          </p>
        </div>
        <OutlineContainer className="mx-auto mt-8 grid max-w-4xl overflow-hidden md:grid-cols-2">
          <div className="p-7 md:p-9">
            <p className="font-bold text-[var(--color-muted)]">Mensal</p>
            <p className="mt-2 text-[1.75rem] font-bold tracking-[-0.04em] text-[var(--color-ink)]">
              R$ 179<span className="text-base font-bold tracking-normal text-[var(--color-muted)]">/mês</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-body)]">Flexibilidade para colocar sua Loja no ar.</p>
          </div>
          <div className="border-t border-[var(--color-hairline)] p-7 md:border-l md:border-t-0 md:p-9">
            <div className="flex items-center justify-between gap-4">
              <p className="font-bold text-[var(--color-muted)]">Anual</p>
              <span className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-bold text-[var(--color-ink)]">20% OFF</span>
            </div>
            <p className="mt-2 text-[1.75rem] font-bold tracking-[-0.04em] text-[var(--color-ink)]">
              R$ 1.718,40<span className="text-base font-bold tracking-normal text-[var(--color-muted)]">/ano</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-body)]">Economia para quem quer planejar o ano.</p>
          </div>
          <div className="border-t border-[var(--color-hairline)] p-6 md:col-span-2 md:flex md:items-center md:justify-between">
            <p className="mb-4 font-bold text-[var(--color-body)] md:mb-0">Pronto para abrir seu Canal próprio?</p>
            <Button href="mailto:contato@foodedelivery.com.br">Falar com a Foode</Button>
          </div>
        </OutlineContainer>
      </section>

      <footer className="border-t border-[var(--color-hairline-soft)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between md:px-8">
          <BrandMark size="compact">
            <Image src={logo} alt="Foode Delivery" width={96} height={96} />
          </BrandMark>
          <p>Canal próprio para delivery local.</p>
        </div>
      </footer>
    </main>
  );
}
