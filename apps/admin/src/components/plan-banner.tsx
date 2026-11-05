// Banner do Plano na sidebar do Dono (decisão 72, substitui a P-PLN-1 da decisão 63): barra que
// enche com os Pedidos do mês dentro da faixa ("128 de 150 Pedidos"), a faixa e o valor do Plano,
// e "Ver meu plano" → `/plano`. Sem Plano ativo não aparece. Presentacional (server-safe).
import { ownerPlanBanner, type OwnerPlanView } from "@foode/shared/onboarding";
import Link from "next/link";

export function PlanBanner({ plan }: { plan: OwnerPlanView }) {
  const banner = ownerPlanBanner(plan);
  if (!banner) return null;
  return (
    <section
      aria-label="Seu Plano"
      className="rounded-2xl border border-[var(--color-hairline)] p-4 text-sm"
    >
      <p className="font-bold text-[var(--color-ink)]">{banner.cycleLabel}</p>
      {banner.tierLabel ? <p className="text-[var(--color-muted)]">{banner.tierLabel}</p> : null}
      <p className="mt-3 font-bold text-[var(--color-ink)]">{banner.progressLabel}</p>
      {banner.percent !== null ? (
        <div
          role="progressbar"
          aria-label="Pedidos do mês na faixa"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={banner.percent}
          aria-valuetext={banner.progressLabel}
          className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-hairline-soft)]"
        >
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-[width] motion-reduce:transition-none"
            style={{ width: `${banner.percent}%` }}
          />
        </div>
      ) : null}
      {banner.priceLabel ? (
        <p className="mt-2 text-[var(--color-body)]">{banner.priceLabel}</p>
      ) : null}
      <Link
        href="/plano"
        className="foode-button foode-button--secondary mt-3 min-h-10 w-full px-4 py-2 text-sm"
      >
        Ver meu plano
      </Link>
    </section>
  );
}
