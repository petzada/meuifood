"use client";

// Como funciona (PROPOSTA-LANDING §2.5): 3 passos; no desktop a coluna direita é sticky e
// troca a tela conforme o passo visível (observer por passo, threshold 0.5). No mobile cada
// passo mostra a própria tela; com reduced-motion, sem sticky e sem crossfade.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { CheckoutShot, LaptopFrame, PanelLinkShot, PanelQueueShot, PhoneFrame } from "./mockups";

type Step = { title: string; text: string; screen: ReactNode };

const STEPS: readonly Step[] = [
  {
    title: "Divulgue seu link ou QR Code",
    text: "A Foode cadastra sua loja e você monta o cardápio. Coloque o link na bio, no WhatsApp e na mesa.",
    screen: (
      <LaptopFrame>
        <PanelLinkShot alt="Painel com o link personalizado da loja, botão de copiar e QR Code para baixar" />
      </LaptopFrame>
    ),
  },
  {
    title: "Seu cliente pede pelo celular",
    text: "Cardápio com busca e destaques, checkout em uma tela, PIX, cartão ou pagamento na entrega. Sem app, sem cadastro obrigatório.",
    screen: (
      <PhoneFrame>
        <CheckoutShot alt="Checkout do cardápio em uma tela: nome, WhatsApp, endereço, forma de pagamento e total" />
      </PhoneFrame>
    ),
  },
  {
    title: "Você aceita, imprime e entrega",
    text: "Fila com som, impressão em 80 mm e aviso no WhatsApp com link de acompanhamento do pedido.",
    screen: (
      <LaptopFrame>
        <PanelQueueShot alt="Fila de pedidos do painel com o botão Aceitar e imprimir" />
      </LaptopFrame>
    ),
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = refs.current.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) setActive(index);
        }
      },
      { threshold: 0.5 },
    );
    refs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-8 md:grid-cols-[5fr_7fr] md:gap-12">
      <ol className="grid gap-4 md:gap-6">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className={[
              "mk-how__step grid gap-4 p-5 md:p-6",
              index === active ? "is-active" : "",
            ].join(" ")}
            data-reveal
            ref={(element) => {
              refs.current[index] = element;
            }}
            style={{ "--reveal-i": index } as CSSProperties}
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
            <div className="justify-self-center md:hidden">{step.screen}</div>
          </li>
        ))}
      </ol>
      <div className="hidden md:block">
        <div className="mk-how__sticky">
          <div aria-hidden className="mk-how__screens justify-items-center">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className={[
                  "mk-how__screen w-full justify-items-center",
                  index === active ? "is-active" : "",
                ].join(" ")}
                style={{ display: "grid" }}
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
