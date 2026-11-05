// Dor vs. marketplace (decisão 70): tom complementar (decisão 03), sem citar % de comissão.
// Barras ilustrativas crescem ao entrar (scaleX); sem número de comissão, só a ideia.
import { Handshake, Repeat, UserPlus } from "@phosphor-icons/react/dist/ssr";
import type { CSSProperties } from "react";

import { SectionHeading } from "./primitives";

const POINTS = [
  {
    icon: UserPlus,
    title: "Marketplace traz cliente novo",
    text: "Ele continua útil para quem nunca pediu de você. Não é para sair dele.",
  },
  {
    icon: Repeat,
    title: "Cliente que volta pede no seu link",
    text: "Quem já conhece a sua loja pede de novo pelo seu cardápio, sem comissão nesse pedido.",
  },
  {
    icon: Handshake,
    title: "Mensalidade fixa por faixa",
    text: "Você sabe quanto paga no mês. O pedido é seu, o cliente é seu, o contato é seu.",
  },
] as const;

export function PainSection() {
  return (
    <section aria-labelledby="dor-title" className="mk-section">
      <div className="mk-container grid gap-10 md:grid-cols-[7fr_5fr] md:items-center md:gap-16">
        <div className="order-2 grid gap-5 md:order-1" data-reveal>
          <div className="foode-outline grid gap-5 p-6 md:p-8">
            <Bar
              label="Pedido de cliente novo no marketplace"
              note="comissão por pedido"
              width={62}
            />
            <Bar
              label="Pedido de cliente recorrente no seu link"
              note="sem comissão"
              width={100}
              primary
            />
            <p className="text-xs text-[var(--color-muted)]">
              Ilustração: o mesmo pedido, em dois canais. O marketplace cobra uma parte da venda; no
              seu link, o valor fica com a loja (menos só a taxa do pagamento online, se houver).
            </p>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <SectionHeading
            align="left"
            eyebrow="Complementar ao marketplace"
            id="dor-title"
            lead="O marketplace cobra comissão em todo pedido, inclusive do cliente que já é seu. A Foode é o canal para esse cliente pedir direto, sem comissão."
          >
            Pare de pagar comissão no pedido de quem já é seu cliente.
          </SectionHeading>
          <ul className="mt-8 grid gap-5">
            {POINTS.map((point, i) => (
              <li
                key={point.title}
                className="flex gap-4"
                data-reveal
                style={{ "--reveal-i": i } as CSSProperties}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--color-primary)] text-[var(--color-primary-strong)]">
                  <point.icon aria-hidden size={20} weight="bold" />
                </span>
                <div>
                  <p className="font-bold text-[var(--color-ink)]">{point.title}</p>
                  <p className="text-sm leading-relaxed text-[var(--color-body)]">{point.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Bar({
  label,
  note,
  primary,
  width,
}: {
  label: string;
  note: string;
  primary?: boolean;
  width: number;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold text-[var(--color-ink)]">{label}</span>
        <span className="text-[var(--color-muted)]">{note}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full border border-[var(--color-hairline)]">
        <div
          className={[
            "mk-bar__fill h-full rounded-full",
            primary ? "bg-[var(--color-primary)]" : "bg-[var(--color-hairline)]",
          ].join(" ")}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
