// Funcionalidades (PROPOSTA-LANDING §2.6): bento 12 colunas, 6 cards outline, com telas
// reais nos dois maiores. Só o que existe (decisões 60–63); nada de roadmap.
import {
  ChartLineUp,
  CreditCard,
  ForkKnife,
  ListChecks,
  ShoppingBagOpen,
  Ticket,
} from "@phosphor-icons/react/dist/ssr";
import type { CSSProperties } from "react";

import { LaptopFrame, PanelQueueShot, PhoneFrame, StorefrontShot } from "./mockups";

const FEATURES = [
  {
    icon: ForkKnife,
    title: "Cardápio com complementos e adicionais",
    text: "Categorias, fotos, destaques, busca, disponibilidade por item e “copiar grupos de outro item”.",
    shot: (
      <div className="mt-6 flex items-start justify-center">
        <PhoneFrame className="max-w-[12.5rem]">
          <StorefrontShot alt="Cardápio digital com destaques e itens com foto, descrição e preço" />
        </PhoneFrame>
      </div>
    ),
  },
  {
    icon: ShoppingBagOpen,
    title: "Checkout em uma tela",
    text: "Delivery por bairro ou taxa fixa, retirada, pedido mínimo, troco, cupom e CEP que preenche o endereço.",
  },
  {
    icon: CreditCard,
    title: "PIX e cartão online",
    text: "Taxa Foode única por meio, combinada no cadastro; repasse em lote diário, 1 dia útil após a liberação. Cartão no modo Normal ou Rápido (D+1).",
  },
  {
    icon: ListChecks,
    title: "Fila de pedidos",
    text: "Som no pedido novo, chips delivery/retirada, imprimir ao aceitar, cancelamento com estorno automático.",
    shot: (
      <div className="mt-5 flex items-start">
        <LaptopFrame className="max-w-none">
          <PanelQueueShot alt="Fila de pedidos do painel" />
        </LaptopFrame>
      </div>
    ),
  },
  {
    icon: Ticket,
    title: "Cupons e boas-vindas",
    text: "Código, % ou R$, dias da semana e limite de usos para puxar o cliente para o seu link.",
  },
  {
    icon: ChartLineUp,
    title: "Relatórios e funil",
    text: "Top itens por dia da semana, funil visita → pedido, exportação CSV, Pixel Meta e Google.",
  },
] as const;

export function Features() {
  return (
    <div className="mk-bento">
      {FEATURES.map((feature, i) => (
        <article
          key={feature.title}
          className="mk-feature foode-outline flex flex-col p-6"
          data-reveal
          style={{ "--reveal-i": i } as CSSProperties}
        >
          <feature.icon
            aria-hidden
            className="mk-feature__icon text-[var(--color-primary)]"
            size={28}
            weight="bold"
          />
          <h3 className="mk-h3 mt-5">{feature.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">{feature.text}</p>
          {"shot" in feature ? feature.shot : null}
        </article>
      ))}
    </div>
  );
}
