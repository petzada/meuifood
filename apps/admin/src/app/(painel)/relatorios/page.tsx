import type { FinanceReport } from "@foode/shared/finance";
import { redirect } from "next/navigation";

import { periodFromSearchParams, type SearchParamsLike } from "../../../lib/finance-labels";
import { painelRpc } from "../../../lib/painel-rpc";
import { requirePermission } from "../../../lib/session";
import { exportReportCsv } from "./actions";
import { ReportView } from "./_components/report-view";

// `/relatorios` (Ticket 14; REL-01/REL-02, decisões 63, 64 e 71): só o Dono (`store.finance`).
// O período vem da URL (`?periodo=7d` ou `custom&de&ate`): trocar o atalho navega e recarrega a
// consulta no servidor. A api agrega; aqui só se formata. Período Personalizado com fim no futuro
// = `invalid_input`: a tela mostra o aviso com o seletor, sem derrubar a página.
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsLike>;
}) {
  const session = await requirePermission("store.finance");
  const period = periodFromSearchParams((await searchParams) ?? {});
  const result = await painelRpc((api, caller) => api.reportsGet(caller, { period }));

  let report: FinanceReport | null = null;
  let invalid = false;
  if (result.ok) report = result.data;
  else if (result.error === "invalid_input") invalid = true;
  else if (result.error === "unauthenticated") redirect("/entrar");
  else if (result.error === "forbidden") redirect("/");
  else throw new Error(`Falha ao carregar os Relatórios (${result.error}).`);

  return (
    <ReportView
      exportCsv={exportReportCsv}
      invalid={invalid}
      period={period}
      report={report}
      storeName={session.activeStore?.name ?? ""}
    />
  );
}
