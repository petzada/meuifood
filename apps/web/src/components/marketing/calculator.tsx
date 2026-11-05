"use client";

// Calculadora (decisão 70): pedidos/mês, ticket médio e comissão atual → quanto deixaria de
// pagar com a Foode (mensalidade da faixa correspondente). Regra em `content/pricing.ts`.
import { Field, Input } from "@foode/ui";
import { useId, useState } from "react";

import { estimateSavings, formatBRL, tierLabel } from "../../content/pricing";

export type CalculatorProps = {
  initialOrders?: number;
  initialTicketCents?: number;
  initialCommissionPercent?: number;
};

function parseNumber(value: string): number {
  const normalized = value
    .replace(/\./gu, "")
    .replace(",", ".")
    .replace(/[^\d.]/gu, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function Calculator({
  initialOrders = 200,
  initialTicketCents = 6000,
  initialCommissionPercent = 23,
}: CalculatorProps) {
  const [orders, setOrders] = useState(String(initialOrders));
  const [ticket, setTicket] = useState((initialTicketCents / 100).toFixed(2).replace(".", ","));
  const [commission, setCommission] = useState(String(initialCommissionPercent));
  const resultId = useId();

  const result = estimateSavings({
    ordersPerMonth: parseNumber(orders),
    averageTicketCents: Math.round(parseNumber(ticket) * 100),
    commissionPercent: parseNumber(commission),
  });
  const positive = result.savingsCents > 0;

  return (
    <div className="foode-outline grid gap-6 p-6 md:grid-cols-[1fr_1fr] md:p-8">
      <form
        aria-describedby={resultId}
        className="grid gap-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field hint="Pedidos de clientes que já conhecem a sua loja." label="Pedidos por mês">
          {(a11y) => (
            <Input
              {...a11y}
              inputMode="numeric"
              name="orders"
              onChange={(event) => setOrders(event.target.value)}
              value={orders}
            />
          )}
        </Field>
        <Field label="Ticket médio (R$)">
          {(a11y) => (
            <Input
              {...a11y}
              inputMode="decimal"
              name="ticket"
              onChange={(event) => setTicket(event.target.value)}
              value={ticket}
            />
          )}
        </Field>
        <Field
          hint="A porcentagem que o marketplace fica em cada pedido."
          label="Comissão que você paga hoje (%)"
        >
          {(a11y) => (
            <Input
              {...a11y}
              inputMode="decimal"
              name="commission"
              onChange={(event) => setCommission(event.target.value)}
              value={commission}
            />
          )}
        </Field>
      </form>

      <output
        aria-live="polite"
        className="grid content-start gap-4 rounded-[var(--radius-container)] border border-[var(--color-primary)] p-5"
        id={resultId}
      >
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Se esses pedidos viessem pelo seu link
        </p>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-body)]">Comissão por mês hoje</dt>
            <dd className="font-bold text-[var(--color-ink)]" data-testid="commission">
              {formatBRL(result.commissionCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-body)]">
              Mensalidade Foode ({tierLabel(result.tier)})
            </dt>
            <dd className="font-bold text-[var(--color-ink)]" data-testid="monthly-fee">
              {formatBRL(result.monthlyFeeCents)}
            </dd>
          </div>
        </dl>
        <div className="border-t border-[var(--color-hairline-soft)] pt-4">
          <p className="text-sm text-[var(--color-body)]">
            {positive ? "Você deixaria de pagar, por mês" : "Com esse volume, a diferença por mês"}
          </p>
          <p
            className="mt-1 text-3xl font-bold tracking-[-0.03em] text-[var(--color-primary-strong)]"
            data-testid="savings"
          >
            {formatBRL(Math.abs(result.savingsCents))}
            {positive ? "" : " a menos de comissão que a mensalidade"}
          </p>
          {positive ? (
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {formatBRL(result.yearlySavingsCents)} em 12 meses, sem contar as taxas do pagamento
              online.
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              A mensalidade ainda pode compensar pelo cliente que fica com você; fale com a Foode.
            </p>
          )}
        </div>
      </output>
    </div>
  );
}
