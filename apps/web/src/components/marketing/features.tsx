// Funcionalidades (PROPOSTA-LANDING §2.6): bento 12 colunas, 6 cards outline. O primeiro
// traz a captura real do cardápio; os demais preenchem o card com 3–4 benefícios curtos, na
// língua do dono de loja (nada de jargão do produto). Só o que existe (decisões 60–63).
import {
  ChartLineUp,
  Check,
  CreditCard,
  ForkKnife,
  ListChecks,
  ShoppingBagOpen,
  Ticket,
} from "@phosphor-icons/react/dist/ssr";
import type { CSSProperties } from "react";

import { PhoneFrame, StorefrontShot } from "./mockups";

export const FEATURES = [
  {
    icon: ForkKnife,
    title: "Cardápio digital do seu jeito",
    text: "Com foto, descrição e preço. Monte uma vez e reaproveite os sabores, bordas e molhos nos outros produtos.",
    bullets: [
      "Categorias, destaques e busca",
      "Ponto da carne, tamanho e extras com preço",
      "Marque “esgotado” em um toque",
      "Fotos direto do celular",
    ],
  },
  {
    icon: ShoppingBagOpen,
    title: "Pedido fechado numa tela só",
    text: "O cliente não baixa app nem cria conta.",
    bullets: [
      "Entrega por bairro ou taxa única",
      "Retirada no balcão",
      "Pedido mínimo e troco para quanto",
      "CEP preenche o endereço sozinho",
    ],
  },
  {
    icon: CreditCard,
    title: "PIX e cartão na hora do pedido",
    text: "Pago antes de sair da cozinha.",
    bullets: [
      "Uma taxa só, combinada no cadastro",
      "Dinheiro cai na conta em lote diário",
      "Cartão com opção de receber em 1 dia",
      "Na entrega continua sem taxa",
    ],
  },
  {
    icon: ListChecks,
    title: "Pedidos chegando no balcão",
    text: "Tudo num lugar só, pelo celular ou computador.",
    bullets: [
      "Toca um aviso quando chega pedido novo",
      "Imprime o pedido na impressora do balcão",
      "Separe entrega e retirada num toque",
      "Cancelou? O estorno sai sozinho",
    ],
  },
  {
    icon: Ticket,
    title: "Cupons para trazer o cliente de volta",
    text: "Para quem pede pelo seu link.",
    bullets: [
      "Desconto em % ou em reais",
      "Só nos dias que você escolher",
      "Limite de usos por cupom",
      "Cupom de boas-vindas pronto",
    ],
  },
  {
    icon: ChartLineUp,
    title: "Números do seu delivery",
    text: "Para decidir com base no que vende.",
    bullets: [
      "Itens mais vendidos por dia da semana",
      "Quantos abriram o link e quantos pediram",
      "Planilha dos pedidos para baixar",
      "Anúncios do Instagram e Google medindo certo",
    ],
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
          <ul className="mk-feature__list mt-4 grid gap-2 text-sm text-[var(--color-body)]">
            {feature.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2">
                <Check
                  aria-hidden
                  className="mt-0.5 shrink-0 text-[var(--color-primary-strong)]"
                  size={16}
                  weight="bold"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          {i === 0 ? (
            <div className="mt-6 flex flex-1 items-end justify-center">
              <PhoneFrame className="max-w-[13rem]">
                <StorefrontShot alt="Cardápio digital da loja com destaques e itens com foto, descrição e preço" />
              </PhoneFrame>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
