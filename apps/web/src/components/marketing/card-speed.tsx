// "Modo rápido no cartão" (substitui a seção de taxas; Dono, 2026-11-05): o lojista escolhe
// receber o cartão mais rápido. Comparação direta Normal × Rápido, uma coisa por linha
// (liberação, tarifa). Liberação ≠ repasse: o provedor LIBERA o valor (21 dias úteis ou D+1)
// e a Foode REPASSA sempre em lote diário o que já foi liberado. Tarifas = constantes da
// decisão 76; quando a api expuser as taxas públicas, `fees` sobrescreve (e deve bater).
import { Lightning, Timer } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { DEFAULT_FEES, formatFee, type PublicFee, RELEASE_TERMS } from "../../content/pricing";

export type CardSpeedProps = {
  fees?: { normal: PublicFee; rapido: PublicFee } | null;
};

export function CardSpeed({ fees = null }: CardSpeedProps) {
  const normal = fees?.normal ?? DEFAULT_FEES.cardNormal;
  const rapido = fees?.rapido ?? DEFAULT_FEES.cardRapido;
  return (
    <section aria-labelledby="modo-rapido-title" className="grid gap-6" data-reveal>
      <div className="grid max-w-2xl gap-3">
        <h3 className="mk-h3" id="modo-rapido-title">
          Modo rápido no cartão
        </h3>
        <p className="text-[var(--color-body)]">
          No cartão de crédito você escolhe: o prazo normal, com a tarifa menor, ou o modo rápido,
          com o valor liberado no dia útil seguinte. O repasse para a sua conta é sempre em lote
          diário com o que já foi liberado. PIX libera em 1 dia útil; pagamento na entrega não tem
          tarifa.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="card-modes">
        <Mode
          fee={formatFee(normal)}
          icon={<Timer aria-hidden size={22} weight="bold" />}
          term={RELEASE_TERMS.cardNormal}
          title="Normal"
        />
        <Mode
          fee={formatFee(rapido)}
          highlight
          icon={<Lightning aria-hidden size={22} weight="fill" />}
          term={RELEASE_TERMS.cardRapido}
          title="Rápido"
        />
      </div>
    </section>
  );
}

function Mode({
  fee,
  highlight,
  icon,
  term,
  title,
}: {
  fee: string;
  highlight?: boolean;
  icon: ReactNode;
  term: string;
  title: string;
}) {
  return (
    <article
      aria-label={`Cartão ${title}`}
      className={[
        "foode-outline grid content-start gap-3 p-5",
        highlight ? "border-[var(--color-primary)]" : "",
      ].join(" ")}
    >
      <p className="flex items-center gap-2 font-bold text-[var(--color-ink)]">
        <span className="text-[var(--color-primary-strong)]">{icon}</span>
        Cartão · {title}
      </p>
      <dl className="grid gap-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--color-muted)]">Liberação</dt>
          <dd className="font-bold text-[var(--color-ink)]">{term}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--color-muted)]">Tarifa por transação</dt>
          <dd className="font-bold text-[var(--color-ink)]">{fee}</dd>
        </div>
      </dl>
    </article>
  );
}
