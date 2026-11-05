"use client";

// Como funciona (PROPOSTA-LANDING §2.5): 3 passos. No desktop, a coluna da direita fica
// sticky e troca a tela conforme o passo mais visível; os passos da esquerda são conteúdo
// comum, SEMPRE visíveis (nenhum deles depende de observer/reveal para aparecer). No mobile
// cada passo mostra a própria tela. Com reduced-motion: sem crossfade.
import { useEffect, useRef, useState, type ReactNode } from "react";

import { LaptopFrame, PanelQueueShot, PhoneFrame, StorefrontShot } from "./mockups";

type Step = { title: string; text: string; screen: ReactNode };

export const HOW_IT_WORKS_STEPS: readonly Step[] = [
  {
    title: "Divulgue seu link ou QR Code",
    text: "A Foode cadastra sua loja e monta o cardápio com você. Depois é só colocar o link na bio, no WhatsApp e na mesa.",
    screen: (
      <PhoneFrame>
        <StorefrontShot alt="Cardápio da loja aberto no celular, como o cliente vê pelo link" />
      </PhoneFrame>
    ),
  },
  {
    title: "Seu cliente pede pelo celular",
    text: "Ele abre o cardápio, escolhe, fecha o pedido numa tela só e paga com PIX, cartão ou na entrega. Sem baixar app, sem criar conta.",
    screen: (
      <PhoneFrame>
        <StorefrontShot alt="Cardápio no celular com itens no carrinho e o botão Ver carrinho" />
      </PhoneFrame>
    ),
  },
  {
    title: "Você aceita, imprime e entrega",
    text: "Toca um aviso quando chega pedido novo. Você aceita, imprime na impressora do balcão e o cliente acompanha tudo pelo WhatsApp.",
    screen: (
      <LaptopFrame>
        <PanelQueueShot alt="Fila de pedidos do painel com os pedidos recebidos, em preparo e prontos" />
      </LaptopFrame>
    ),
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    // Passo ativo = o que está mais perto do centro da viewport (entre os visíveis).
    const ratios = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
        let best = -1;
        let bestRatio = 0;
        refs.current.forEach((element, index) => {
          const ratio = element ? (ratios.get(element) ?? 0) : 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = index;
          }
        });
        if (best >= 0) setActive(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-20% 0px -20% 0px" },
    );
    refs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mk-how grid gap-8 md:grid-cols-[5fr_7fr] md:gap-12" data-testid="how-it-works">
      <ol className="mk-how__steps grid content-start gap-4 md:gap-6">
        {HOW_IT_WORKS_STEPS.map((step, index) => (
          <li
            key={step.title}
            className={[
              "mk-how__step grid gap-4 p-5 md:p-6",
              index === active ? "is-active" : "",
            ].join(" ")}
            data-step={index + 1}
            ref={(element) => {
              refs.current[index] = element;
            }}
          >
            <div className="flex items-start gap-4">
              <span aria-hidden className="mk-how__num">
                {index + 1}
              </span>
              <div>
                <h3 className="mk-h3">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-[var(--color-body)]">{step.text}</p>
              </div>
            </div>
            <div className="mk-how__inline justify-self-center md:hidden">{step.screen}</div>
          </li>
        ))}
      </ol>
      <div className="mk-how__aside hidden md:block">
        <div className="mk-how__sticky">
          <div aria-hidden className="mk-how__screens">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <div
                key={step.title}
                className={["mk-how__screen", index === active ? "is-active" : ""].join(" ")}
              >
                {step.screen}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
