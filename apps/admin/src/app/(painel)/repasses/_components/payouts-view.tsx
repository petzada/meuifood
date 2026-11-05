// Tela Repasses do Dono (REL-04; presentacional, server-safe): totais por status, lançamentos
// (Pedido, meio, total, taxa Foode, líquido, repasse previsto, status) e lotes pagos. Nunca custo
// do provedor nem custo do envio (decisão 61); a tarifa de serviço aparece só como informação
// separada do líquido (decisão 71).
import { Button, OutlineContainer } from "@foode/ui";
import {
  type OwnerPayoutsView,
  PAYOUT_LINE_STATUS_LABEL,
  PAYOUT_LINE_STATUSES,
  REPORT_MAX_DAYS,
} from "@foode/shared/finance";
import Link from "next/link";

import { CivilRangeForm } from "../../../../components/civil-range-form";
import { PayoutStatusBadge, SourceAccountBadge } from "../../../../components/payout-badges";
import {
  formatCivilDate,
  formatCivilRange,
  formatCount,
  formatSignedCents,
  PAYOUT_LINE_KIND_LABEL,
  PAYOUT_METHOD_LABEL,
} from "../../../../lib/finance-labels";
import { formatCents } from "../../../../lib/ops-format";
import { CARD_MODE_LABEL } from "../../../../lib/ops-labels";
import { EmptyState, SectionHeading } from "../../ops/_components/fields";

const TH =
  "px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]";
const TD = "px-4 py-3 text-[var(--color-ink)]";
const TD_NUM = `${TD} text-right tabular-nums`;

export function PayoutsView({
  invalid,
  range,
  view,
}: {
  invalid: boolean;
  range: { from: string; to: string };
  view: OwnerPayoutsView | null;
}) {
  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-sm font-bold text-[var(--color-muted)]">Financeiro</p>
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
          Repasses
        </h1>
        <p className="mt-2 max-w-[60ch] leading-relaxed text-[var(--color-body)]">
          O que a Foode repassa para a sua conta Pix pelos pagamentos online, por lançamento e por
          lote. Só leitura: dúvidas sobre um lote, fale com a equipe Foode.
        </p>
      </header>

      <CivilRangeForm
        action="/repasses"
        from={range.from}
        to={range.to}
        hint={`Repasse previsto (lançamentos) ou data do Pix (lotes) no período, até ${REPORT_MAX_DAYS} dias.`}
      />

      {invalid || !view ? (
        <OutlineContainer className="p-6" role="alert">
          <p className="font-bold text-[var(--color-ink)]">Período inválido.</p>
          <p className="mt-1 text-sm text-[var(--color-body)]">
            Escolha um intervalo de até {REPORT_MAX_DAYS} dias, com o início antes do fim.
          </p>
          <Button asChild className="mt-4" variant="secondary">
            <Link href="/repasses">Voltar ao período padrão</Link>
          </Button>
        </OutlineContainer>
      ) : (
        <>
          <section
            aria-label="Totais por status"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            {PAYOUT_LINE_STATUSES.map((status) => {
              const total = view.totals[status];
              return (
                <OutlineContainer key={status} className="p-4">
                  <PayoutStatusBadge status={status} />
                  <p className="mt-2 text-xl font-bold tabular-nums text-[var(--color-ink)]">
                    {formatSignedCents(total.netCents, formatCents)}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {formatCount(total.count)} {total.count === 1 ? "lançamento" : "lançamentos"}
                  </p>
                </OutlineContainer>
              );
            })}
          </section>

          <OutlineContainer
            as="section"
            aria-labelledby="rep-lancamentos"
            className="overflow-hidden"
          >
            <div className="p-5 pb-3">
              <SectionHeading
                id="rep-lancamentos"
                description={`Lançamentos com repasse previsto entre ${formatCivilRange(view.from, view.to)}. Líquido = total do Pedido − taxa Foode (a tarifa de serviço do Consumidor é da Foode e não entra). Hoje: ${formatCivilDate(view.today)}.`}
              >
                Lançamentos
              </SectionHeading>
            </div>
            {view.lines.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState title="Nenhum lançamento neste período.">
                  Pagamentos online confirmados geram lançamentos com repasse previsto em D+1 útil
                  (PIX) ou no prazo do cartão.
                </EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <caption className="sr-only">
                    Lançamentos de repasse:{" "}
                    {PAYOUT_LINE_STATUSES.map((s) => PAYOUT_LINE_STATUS_LABEL[s]).join(", ")}
                  </caption>
                  <thead>
                    <tr className="border-y border-[var(--color-hairline-soft)]">
                      <th scope="col" className={TH}>
                        Pedido
                      </th>
                      <th scope="col" className={TH}>
                        Lançamento
                      </th>
                      <th scope="col" className={TH}>
                        Meio
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Total
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Taxa Foode
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Líquido
                      </th>
                      <th scope="col" className={TH}>
                        Repasse previsto
                      </th>
                      <th scope="col" className={TH}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.lines.map((line) => (
                      <tr
                        key={line.id}
                        className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
                      >
                        <th scope="row" className={`${TD} text-left font-bold`}>
                          {line.orderCode === null ? "—" : `#${line.orderCode}`}
                        </th>
                        <td className={TD}>
                          {PAYOUT_LINE_KIND_LABEL[line.kind]}
                          {line.reason ? (
                            <span className="block text-xs text-[var(--color-muted)]">
                              {line.reason}
                            </span>
                          ) : null}
                        </td>
                        <td className={TD}>
                          {line.method ? PAYOUT_METHOD_LABEL[line.method] : "—"}
                          {line.cardMode ? (
                            <span className="block text-xs text-[var(--color-muted)]">
                              {CARD_MODE_LABEL[line.cardMode]}
                            </span>
                          ) : null}
                        </td>
                        <td className={TD_NUM}>
                          {line.orderTotalCents ? formatCents(line.orderTotalCents) : "—"}
                        </td>
                        <td className={TD_NUM}>
                          {line.foodeFeeCents ? formatCents(line.foodeFeeCents) : "—"}
                        </td>
                        <td className={`${TD_NUM} font-bold`}>
                          {formatSignedCents(line.netCents, formatCents)}
                        </td>
                        <td className={TD}>
                          {line.expectedPayoutDate
                            ? formatCivilDate(line.expectedPayoutDate)
                            : "Próximo lote"}
                        </td>
                        <td className={TD}>
                          <PayoutStatusBadge status={line.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OutlineContainer>

          <OutlineContainer as="section" aria-labelledby="rep-lotes" className="overflow-hidden">
            <div className="p-5 pb-3">
              <SectionHeading
                id="rep-lotes"
                description="Pix já enviados pela Foode, com a data e o identificador do comprovante."
              >
                Lotes pagos
              </SectionHeading>
            </div>
            {view.batches.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState title="Nenhum lote pago neste período." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <caption className="sr-only">Lotes pagos</caption>
                  <thead>
                    <tr className="border-y border-[var(--color-hairline-soft)]">
                      <th scope="col" className={TH}>
                        Lote do dia
                      </th>
                      <th scope="col" className={TH}>
                        Pix em
                      </th>
                      <th scope="col" className={TH}>
                        Conta
                      </th>
                      <th scope="col" className={TH}>
                        Identificador
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Lançamentos
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Débitos
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Ajustes
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        Valor do Pix
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.batches.map((batch) => (
                      <tr
                        key={batch.id}
                        className="border-b border-[var(--color-hairline-soft)] last:border-b-0"
                      >
                        <th scope="row" className={`${TD} text-left font-bold`}>
                          {formatCivilDate(batch.payoutDate)}
                        </th>
                        <td className={TD}>{formatCivilDate(batch.paidOn)}</td>
                        <td className={TD}>
                          <SourceAccountBadge account={batch.sourceAccount} />
                        </td>
                        <td className={`${TD} break-all`}>{batch.reference}</td>
                        <td className={TD_NUM}>{formatCents(batch.entriesCents)}</td>
                        <td className={TD_NUM}>
                          {batch.debitsCents ? `− ${formatCents(batch.debitsCents)}` : "—"}
                        </td>
                        <td className={TD_NUM}>
                          {batch.adjustmentsCents
                            ? formatSignedCents(batch.adjustmentsCents, formatCents)
                            : "—"}
                        </td>
                        <td className={`${TD_NUM} font-bold`}>{formatCents(batch.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OutlineContainer>
        </>
      )}
    </section>
  );
}
