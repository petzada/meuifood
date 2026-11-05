import { ownerPlanBanner } from "@foode/shared/onboarding";
import { OutlineContainer } from "@foode/ui";

import { formatDateSp } from "../../../lib/ops-format";
import { painelRead } from "../../../lib/painel-rpc";
import { requirePermission } from "../../../lib/session";
import { EmptyState, Facts } from "../ops/_components/fields";

// `/plano` (decisão 72; REL-03): só leitura — Plano, ciclo, faixa do mês, contagem de Pedidos e
// vigência. Cobrança fora do app (decisão 61). O Ticket 14 completa (histórico, Repasses).
export const dynamic = "force-dynamic";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  return `${MONTHS[Number(number) - 1] ?? month} de ${year}`;
}

export default async function PlanPage() {
  await requirePermission("store.settings");
  const view = await painelRead("o Plano", (api, caller) => api.storePlanGet(caller));
  const banner = ownerPlanBanner(view);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm font-bold text-[var(--color-muted)]">Financeiro</p>
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
          Meu plano
        </h1>
      </header>

      {!view.plan || !banner ? (
        <EmptyState title="Sua Loja ainda não tem Plano ativo.">
          A equipe Foode ativa seu Plano depois da contratação.
        </EmptyState>
      ) : (
        <OutlineContainer className="space-y-6 p-6">
          <div>
            <p className="text-sm font-bold text-[var(--color-muted)]">
              Pedidos em {monthLabel(view.month)}
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-ink)]">
              {banner.progressLabel}
            </p>
            {banner.percent !== null ? (
              <div
                role="progressbar"
                aria-label="Pedidos do mês na faixa"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={banner.percent}
                aria-valuetext={banner.progressLabel}
                className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--color-hairline-soft)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--color-primary)]"
                  style={{ width: `${banner.percent}%` }}
                />
              </div>
            ) : null}
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Contam os Pedidos não cancelados do mês (horário de Brasília).
            </p>
          </div>
          <Facts
            items={[
              { label: "Plano", value: banner.cycleLabel },
              { label: "Faixa atual", value: banner.tierLabel ?? "—" },
              { label: "Valor", value: banner.priceLabel ?? "—" },
              {
                label: "Vigência",
                value: view.plan.validTo
                  ? `${formatDateSp(view.plan.validFrom)} a ${formatDateSp(view.plan.validTo)}`
                  : `Desde ${formatDateSp(view.plan.validFrom)}`,
              },
            ]}
          />
          <p className="text-sm text-[var(--color-body)]">
            A cobrança é feita pela equipe Foode, fora do app. Mudar de faixa no mês é informativo.
          </p>
        </OutlineContainer>
      )}
    </section>
  );
}
