"use client";

// Sheet "Sobre a Loja" (C6, P-5.1): horários da semana, endereço (só com Retirada ativa,
// P-3.3), como receber com tempo estimado e mínimo (P-2.4), meios de pagamento com as
// bandeiras de débito/crédito na entrega (P-4.3). Cada bloco só aparece quando configurado.
// Descrição, logo e capa entram pelo Ticket 28.
import type { StorefrontStoreState } from "@foode/shared/order";

import { Sheet } from "./sheet";
import {
  brandLines,
  formatStoreAddress,
  fulfillmentSummary,
  paymentMethodNames,
  weeklyHours,
} from "./store-status";

export const ABOUT_STORE_TITLE_ID = "sobre-a-loja-title";

function Block({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="border-t border-[var(--color-hairline-soft)] py-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
        {title}
      </h3>
      <div className="mt-2 text-[var(--color-body)]">{children}</div>
    </section>
  );
}

export function AboutStoreSheet({
  onClose,
  open,
  state,
}: {
  onClose: () => void;
  open: boolean;
  state: StorefrontStoreState;
}) {
  const hours = state.hours.length > 0 ? weeklyHours(state.hours) : [];
  const fulfillment = fulfillmentSummary(state);
  const methods = paymentMethodNames(state);
  const brands = brandLines(state.cardBrands);
  const address = state.pickup ? formatStoreAddress(state.pickup.address) : null;

  return (
    <Sheet labelledBy={ABOUT_STORE_TITLE_ID} onClose={onClose} open={open} title={state.name}>
      <div className="grid">
        {hours.length > 0 ? (
          <Block title="Horários">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {hours.map((day) => (
                <div className="contents" key={day.weekday}>
                  <dt className="font-bold text-[var(--color-ink)]">{day.label}</dt>
                  <dd className="m-0 tabular-nums">
                    {day.periods.length > 0 ? day.periods.join(" · ") : "Fechado"}
                  </dd>
                </div>
              ))}
            </dl>
          </Block>
        ) : null}

        {fulfillment.length > 0 ? (
          <Block title="Como receber">
            <ul className="grid gap-1" role="list">
              {fulfillment.map((line) => (
                <li key={line.label}>
                  <span className="font-bold text-[var(--color-ink)]">{line.label}</span>
                  {line.detail ? <span> · {line.detail}</span> : null}
                </li>
              ))}
            </ul>
          </Block>
        ) : null}

        {address ? (
          <Block title="Endereço para Retirada">
            <p>{address.line1}</p>
            <p>{address.line2}</p>
          </Block>
        ) : null}

        {methods.length > 0 || brands.length > 0 ? (
          <Block title="Pagamento">
            {methods.length > 0 ? <p>{methods.join(" · ")}</p> : null}
            {brands.length > 0 ? (
              <ul className="mt-1 grid gap-0.5 text-sm" role="list">
                {brands.map((line) => (
                  <li key={line.label}>
                    <span className="font-bold text-[var(--color-ink)]">{line.label}:</span>{" "}
                    {line.names}
                  </li>
                ))}
              </ul>
            ) : null}
          </Block>
        ) : null}
      </div>
    </Sheet>
  );
}
