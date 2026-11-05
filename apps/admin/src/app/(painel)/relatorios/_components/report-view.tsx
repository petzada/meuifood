"use client";

// Tela de Relatórios (REL-01/REL-02). Seletor de período (atalhos + Personalizado) que navega
// para `/relatorios?periodo=…` — a consulta roda de novo no servidor; Exportar CSV (download no
// navegador do CSV que a api monta) e Imprimir (impressão nativa sem a moldura do Painel).
// Vazio: "Nenhum Pedido neste período" com atalhos para outro período. Controles e botões
// ficam fora da impressão (`foode-print-hide`).
import { Button, OutlineContainer, useToast } from "@foode/ui";
import {
  type FinanceReport,
  REPORT_MAX_DAYS,
  type ReportPeriodInput,
  type ReportPreset,
} from "@foode/shared/finance";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";

import { downloadTextFile, printReport } from "../../../../lib/browser-export";
import {
  formatCivilRange,
  periodToQuery,
  REPORT_PRESET_LABEL,
  REPORT_QUICK_PRESETS,
} from "../../../../lib/finance-labels";
import { EmptyState } from "../../ops/_components/fields";
import type { ExportCsvResult } from "../actions";
import { ReportBody } from "./report-body";

export type ReportViewProps = {
  exportCsv: (period: ReportPeriodInput) => Promise<ExportCsvResult>;
  /** Período Personalizado com fim no futuro (a api recusou). */
  invalid?: boolean;
  period: ReportPeriodInput;
  report: FinanceReport | null;
  storeName: string;
};

export function ReportView({
  exportCsv,
  invalid = false,
  period,
  report,
  storeName,
}: ReportViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [exporting, startExport] = useTransition();
  const [customOpen, setCustomOpen] = useState(period.preset === "custom");
  const customId = useId();
  const initialFrom = period.preset === "custom" ? period.from : (report?.period.from ?? "");
  const initialTo = period.preset === "custom" ? period.to : (report?.period.to ?? "");

  function go(next: ReportPeriodInput) {
    router.push(`/relatorios?${periodToQuery(next)}`);
  }

  function choose(preset: Exclude<ReportPreset, "custom">) {
    setCustomOpen(false);
    go({ preset });
  }

  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("de") ?? "");
    const to = String(data.get("ate") ?? "");
    if (!from || !to) return;
    go({ preset: "custom", from, to });
  }

  function onExport() {
    startExport(async () => {
      const result = await exportCsv(period);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      downloadTextFile(result.file.filename, result.file.csv, result.file.contentType);
      toast.success(`CSV exportado: ${result.file.filename}`);
    });
  }

  const rangeLabel = report ? formatCivilRange(report.period.from, report.period.to) : null;

  return (
    <section className="mx-auto max-w-6xl space-y-8" data-print-report="">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--color-muted)]">Financeiro</p>
          <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
            Relatórios
          </h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-[var(--color-body)]">
            {storeName ? `${storeName} · ` : ""}
            {rangeLabel ? (
              <>
                {REPORT_PRESET_LABEL[period.preset]}: {rangeLabel}
                {report
                  ? ` (${report.period.days} ${report.period.days === 1 ? "dia" : "dias"})`
                  : ""}
              </>
            ) : (
              "Escolha um período."
            )}
          </p>
        </div>
        <div className="foode-print-hide flex shrink-0 flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={onExport}
            disabled={exporting || !report || report.empty}
            aria-describedby={`${customId}-csv`}
          >
            {exporting ? "Gerando CSV..." : "Exportar CSV"}
          </Button>
          <Button variant="secondary" onClick={printReport} disabled={!report || report.empty}>
            Imprimir
          </Button>
          <p id={`${customId}-csv`} className="sr-only">
            CSV com os agregados do período, sem o TOP 10 clientes e sem dado pessoal. Para PDF, use
            Imprimir e salve pelo navegador.
          </p>
        </div>
      </header>

      <div className="foode-print-hide space-y-3">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
          {REPORT_QUICK_PRESETS.map((preset) => {
            const active = period.preset === preset && !customOpen;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => choose(preset)}
                className={`min-h-11 rounded-full border px-4 text-sm font-bold ${
                  active
                    ? "border-[var(--color-primary-strong)] bg-[var(--color-primary-strong)] text-white"
                    : "border-[var(--color-hairline)] text-[var(--color-body)] hover:border-[var(--color-primary)]"
                }`}
              >
                {REPORT_PRESET_LABEL[preset]}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customOpen}
            aria-expanded={customOpen}
            aria-controls={`${customId}-form`}
            onClick={() => setCustomOpen((open) => !open)}
            className={`min-h-11 rounded-full border px-4 text-sm font-bold ${
              customOpen
                ? "border-[var(--color-primary-strong)] bg-[var(--color-primary-strong)] text-white"
                : "border-[var(--color-hairline)] text-[var(--color-body)] hover:border-[var(--color-primary)]"
            }`}
          >
            {REPORT_PRESET_LABEL.custom}
          </button>
        </div>
        {customOpen ? (
          <form
            id={`${customId}-form`}
            onSubmit={applyCustom}
            className="flex flex-wrap items-end gap-3"
            aria-label="Período personalizado"
          >
            <label className="text-sm font-bold text-[var(--color-ink)]">
              De
              <input
                type="date"
                name="de"
                required
                defaultValue={initialFrom}
                className="mt-1 block min-h-11 rounded-xl border border-[var(--color-hairline)] bg-transparent px-3 text-base font-normal outline-none focus:border-[var(--color-primary)]"
              />
            </label>
            <label className="text-sm font-bold text-[var(--color-ink)]">
              Até
              <input
                type="date"
                name="ate"
                required
                defaultValue={initialTo}
                className="mt-1 block min-h-11 rounded-xl border border-[var(--color-hairline)] bg-transparent px-3 text-base font-normal outline-none focus:border-[var(--color-primary)]"
              />
            </label>
            <Button type="submit" variant="secondary">
              Aplicar período
            </Button>
            <p className="basis-full text-sm text-[var(--color-muted)]">
              Até {REPORT_MAX_DAYS} dias, terminando hoje ou antes (dias de Brasília).
            </p>
          </form>
        ) : null}
      </div>

      {invalid ? (
        <OutlineContainer className="p-6" role="alert">
          <p className="font-bold text-[var(--color-ink)]">
            O período termina no futuro ou passa de {REPORT_MAX_DAYS} dias.
          </p>
          <p className="mt-1 text-sm text-[var(--color-body)]">
            Escolha um período que termine hoje ou antes.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => choose("today")}>
              Ver Hoje
            </Button>
            <Button variant="secondary" onClick={() => choose("30d")}>
              Ver 30 dias
            </Button>
          </div>
        </OutlineContainer>
      ) : report?.empty ? (
        <EmptyState title="Nenhum Pedido neste período">
          <p>Nem Pedidos nem cancelamentos entre {rangeLabel}. Tente outro período:</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {REPORT_QUICK_PRESETS.filter((preset) => preset !== period.preset).map((preset) => (
              <Button key={preset} variant="secondary" onClick={() => choose(preset)}>
                {REPORT_PRESET_LABEL[preset]}
              </Button>
            ))}
          </div>
        </EmptyState>
      ) : report ? (
        <ReportBody report={report} storeName={storeName} />
      ) : null}
    </section>
  );
}
