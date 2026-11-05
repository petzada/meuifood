// Hero (decisão 70): H1/sub/CTA centralizados sobre a foto desfocada; capturas reais logo
// abaixo. Parallax de verdade: ao rolar, as telas SOBEM numa camada à frente e cobrem o
// texto do hero, cada uma numa velocidade (celular mais rápido que o notebook, fundo mais
// lento), via CSS scroll-driven. Sem suporte ou com reduced-motion: camadas no lugar.
// O CTA nunca anima para fora da dobra.
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@foode/ui";
import type { CSSProperties } from "react";

import { FALAR_PATH } from "../../content/site";
import { LaptopFrame, PanelQueueShot, PhoneFrame, StorefrontShot } from "./mockups";
import { RefundLine } from "./primitives";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="mk-hero">
      <div aria-hidden className="mk-hero__bg" />
      <div className="mk-container mk-hero__content pt-12 md:pt-20">
        <div className="mk-hero__copy mx-auto grid max-w-3xl justify-items-center gap-5 text-center">
          <p className="mk-eyebrow" data-reveal style={{ "--reveal-i": 0 } as CSSProperties}>
            Cardápio digital e pedidos sem comissão
          </p>
          <h1
            className="mk-h1"
            data-reveal
            id="hero-title"
            style={{ "--reveal-i": 1 } as CSSProperties}
          >
            Organize seu delivery, sem comissão por pedido
          </h1>
          <p
            className="mk-lead max-w-[46ch]"
            data-reveal
            style={{ "--reveal-i": 2 } as CSSProperties}
          >
            Cardápio digital, pedidos e pagamento online facilitado para o seu negócio
          </p>
          <div
            className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
            data-reveal
            style={{ "--reveal-i": 3 } as CSSProperties}
          >
            <Button className="w-full sm:w-auto" href="/#contato">
              Falar com a Foode
              <ArrowRight aria-hidden size={18} weight="bold" />
            </Button>
            <Button className="w-full sm:w-auto" href={FALAR_PATH} variant="secondary">
              Chamar no WhatsApp
            </Button>
          </div>
          <RefundLine />
        </div>

        <div className="mk-hero__mockups">
          <div
            className="mk-hero__panel mk-parallax-panel"
            data-reveal="right"
            style={{ "--reveal-i": 4 } as CSSProperties}
          >
            <LaptopFrame>
              <PanelQueueShot
                alt="Fila de pedidos do painel da loja, em colunas: recebidos, em preparo e prontos ou saiu para entrega"
                priority
              />
            </LaptopFrame>
          </div>
          <div
            className="mk-hero__phone mk-parallax-phone"
            data-reveal="scale"
            style={{ "--reveal-i": 5 } as CSSProperties}
          >
            <PhoneFrame>
              <StorefrontShot
                alt="Cardápio digital da loja no celular, com destaques, categorias e o botão Ver carrinho"
                priority
              />
            </PhoneFrame>
          </div>
        </div>
      </div>
      <div aria-hidden data-mk-scroll-sentinel className="h-px" />
    </section>
  );
}
