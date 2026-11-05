// Planos (decisões 61, 70, 71): dois cards do mesmo tamanho, linhas alinhadas por subgrid.
// Mensal com as 3 faixas e o selo "Você começa aqui"; Anual com borda primary, badge com a
// % real de desconto, benefícios exclusivos em negrito, "6× de R$ 188,20" em destaque e o
// total à vista abaixo, sem destaque. Reembolso sob cada botão. Tudo lido de `content/pricing`.
import { Check } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button } from "@foode/ui";

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
  "Cardápio digital com complementos e adicionais",
  "Link personalizado e QR Code",
  "Checkout com PIX, cartão e pagamento na entrega",
  "Fila de pedidos com som e impressão 80 mm",
  "Cupons, relatórios e funil",
  "Cadastro feito pela equipe Foode",
] as const;

const ANNUAL_ONLY = ["Pedidos ilimitados o ano inteiro", "Preço travado por 12 meses"] as const;

export function Plans({ ctaHref = "/#contato" }: { ctaHref?: string }) {
  return (
    <div className="mk-plans" data-testid="plans">
      <article aria-labelledby="plan-monthly" className="mk-plan" data-reveal="left">
        <header className="grid gap-1 pb-5">
          <h3 className="mk-h3" id="plan-monthly">
            Mensal
          </h3>
          <p className="text-sm text-[var(--color-body)]">
            O valor acompanha os pedidos do mês. Sem fidelidade.
          </p>
        </header>
        <div className="grid gap-1 pb-5">
          {MONTHLY_TIERS.map((tier) => {
            const start = tier.minOrders === FIRST_MONTHLY_TIER.minOrders;
            return (
              <div
                key={tier.minOrders}
                className={["mk-tier", start ? "mk-tier--start" : ""].join(" ")}
              >
                <span className="grid gap-0.5">
                  {start ? (
                    <span className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-primary-strong)]">
                      Você começa aqui
                    </span>
                  ) : null}
                  <span className="text-sm font-bold text-[var(--color-ink)]">
                    {tierLabel(tier)}/mês
                  </span>
                </span>
                <span className="text-lg font-bold tracking-[-0.02em] text-[var(--color-ink)]">
                  {formatBRL(tier.priceCents)}
                  <span className="text-xs font-bold text-[var(--color-muted)]">/mês</span>
                </span>
              </div>
            );
          })}
          <p className="mt-2 text-xs text-[var(--color-muted)]">+ taxas de pagamento online</p>
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
        <Badge className="mk-plan__badge" tone="accent">
          {ANNUAL_DISCOUNT_PERCENT}% de desconto
        </Badge>
        <header className="grid gap-1 pb-5">
          <h3 className="mk-h3" id="plan-annual">
            Anual
          </h3>
          <p className="text-sm text-[var(--color-body)]">
            Pedidos ilimitados por um valor fixo. Pago uma vez, fora do app.
          </p>
        </header>
        <div className="grid gap-1 pb-5">
          <p
            className="text-3xl font-bold tracking-[-0.03em] text-[var(--color-ink)]"
            data-testid="annual-installment"
          >
            {ANNUAL_INSTALLMENTS}× de {formatBRL(ANNUAL_INSTALLMENT_CENTS)}
          </p>
          <p className="text-sm text-[var(--color-muted)]" data-testid="annual-total">
            ou {formatBRL(ANNUAL_PRICE_CENTS)}/ano à vista
          </p>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {ANNUAL_DISCOUNT_PERCENT}% em relação a 12 mensalidades da faixa acima de 250 pedidos ·
            + taxas de pagamento online
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
