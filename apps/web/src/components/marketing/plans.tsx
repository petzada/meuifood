// Planos (decisões 61, 70, 71 + ajustes do Dono em 2026-11-05): dois cards do mesmo tamanho,
// linhas alinhadas por subgrid. "Você começa aqui" fica ACIMA do card Mensal, fora do
// destaque, para faixas e valores alinharem entre os cards. Anual com borda primary, badge
// amarela com a % real de desconto por cima da borda, "6×" numa linha e a parcela em peso
// maior na linha de baixo, total à vista sem destaque. Tudo lido de `content/pricing`.
import { Check } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@foode/ui";

import {
  ANNUAL_DISCOUNT_PERCENT,
  ANNUAL_INSTALLMENT_CENTS,
  ANNUAL_INSTALLMENTS,
  ANNUAL_PRICE_CENTS,
  FIRST_MONTHLY_TIER,
  formatBRL,
  MONTHLY_TIERS,
  tierLabel,
} from "../../content/pricing";
import { RefundLine } from "./primitives";

const INCLUDED = [
  "Cardápio digital com fotos, tamanhos e extras",
  "Link personalizado e QR Code",
  "PIX, cartão e pagamento na entrega",
  "Aviso de pedido novo e impressão no balcão",
  "Cupons e relatórios de vendas",
  "Cadastro feito pela equipe Foode",
] as const;

const ANNUAL_ONLY = ["Pedidos ilimitados o ano inteiro", "Preço travado por 12 meses"] as const;

export function Plans({ ctaHref = "/#contato" }: { ctaHref?: string }) {
  return (
    <div className="mk-plans" data-testid="plans">
      <div className="mk-plan__above">
        <span className="mk-plan__start">Você começa aqui</span>
      </div>
      <div className="mk-plan__above mk-plan__above--annual" aria-hidden />

      <article aria-labelledby="plan-monthly" className="mk-plan" data-reveal="left">
        <header className="grid gap-1 pb-5">
          <h3 className="mk-h3" id="plan-monthly">
            Mensal
          </h3>
          <p className="text-sm text-[var(--color-body)]">
            O valor acompanha os pedidos do mês. Sem fidelidade.
          </p>
        </header>
        <div className="grid content-start gap-1 pb-5">
          {MONTHLY_TIERS.map((tier) => {
            const start = tier.minOrders === FIRST_MONTHLY_TIER.minOrders;
            return (
              <div
                key={tier.minOrders}
                className={["mk-tier", start ? "mk-tier--start" : ""].join(" ")}
              >
                <span className="text-sm font-bold text-[var(--color-ink)]">
                  {tierLabel(tier)}/mês
                </span>
                <span className="text-lg font-bold tracking-[-0.02em] text-[var(--color-ink)]">
                  {formatBRL(tier.priceCents)}
                  <span className="text-xs font-bold text-[var(--color-muted)]">/mês</span>
                </span>
              </div>
            );
          })}
        </div>
        <ul className="grid gap-2 border-t border-[var(--color-hairline-soft)] py-5 text-sm text-[var(--color-body)]">
          {INCLUDED.map((item) => (
            <Included key={item}>{item}</Included>
          ))}
          {ANNUAL_ONLY.map((item) => (
            <Included key={item} muted>
              {item}
            </Included>
          ))}
        </ul>
        <div className="grid gap-3 self-end">
          <Button className="w-full" href={ctaHref}>
            Falar com a Foode
          </Button>
          <RefundLine className="justify-center" />
        </div>
      </article>

      <article
        aria-labelledby="plan-annual"
        className="mk-plan mk-plan--annual"
        data-reveal="right"
      >
        <span className="mk-plan__badge" data-testid="annual-badge">
          {ANNUAL_DISCOUNT_PERCENT}% de desconto
        </span>
        <header className="grid gap-1 pb-5">
          <h3 className="mk-h3" id="plan-annual">
            Anual
          </h3>
          <p className="text-sm text-[var(--color-body)]">Pedidos ilimitados por um valor fixo.</p>
        </header>
        <div className="grid content-start gap-1 pb-5">
          <p className="grid text-[var(--color-ink)]" data-testid="annual-installment">
            <span className="text-lg font-bold leading-none tracking-[-0.02em]">
              {ANNUAL_INSTALLMENTS}×
            </span>
            <span className="mt-1 text-[2.25rem] font-bold leading-none tracking-[-0.03em]">
              {formatBRL(ANNUAL_INSTALLMENT_CENTS)}
            </span>
          </p>
          <p className="mt-2 text-sm text-[var(--color-muted)]" data-testid="annual-total">
            ou {formatBRL(ANNUAL_PRICE_CENTS)} à vista
          </p>
        </div>
        <ul className="grid gap-2 border-t border-[var(--color-hairline-soft)] py-5 text-sm text-[var(--color-body)]">
          {INCLUDED.map((item) => (
            <Included key={item}>{item}</Included>
          ))}
          {ANNUAL_ONLY.map((item) => (
            <Included key={item} strong>
              {item}
            </Included>
          ))}
        </ul>
        <div className="grid gap-3 self-end">
          <Button className="w-full" href={ctaHref}>
            Falar com a Foode
          </Button>
          <RefundLine className="justify-center" />
        </div>
      </article>
    </div>
  );
}

function Included({
  children,
  muted,
  strong,
}: {
  children: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <li className={["flex items-start gap-2", muted ? "text-[var(--color-muted)]" : ""].join(" ")}>
      <Check
        aria-hidden
        className={[
          "mt-0.5 shrink-0",
          muted ? "text-[var(--color-hairline)]" : "text-[var(--color-primary-strong)]",
        ].join(" ")}
        size={16}
        weight="bold"
      />
      {strong ? (
        <strong className="font-bold text-[var(--color-ink)]">{children}</strong>
      ) : (
        <span>{muted ? `${children} (só no Anual)` : children}</span>
      )}
    </li>
  );
}
