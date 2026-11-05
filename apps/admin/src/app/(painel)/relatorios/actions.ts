"use server";

// Server action do CSV (Ticket 14, decisão 64): valida o período com o Zod do contrato, pede o
// CSV pronto à api (`reportsExportCsv`, sem TOP 10 clientes nem dado pessoal) e devolve o
// documento; o navegador transforma em download (`lib/browser-export.ts`). A api confere
// `store.finance` de novo.
import {
  type ReportCsvExport,
  type ReportPeriodInput,
  reportInputSchema,
} from "@foode/shared/finance";
import { redirect } from "next/navigation";

import { RPC_ERROR_MESSAGE } from "../../../lib/ops-labels";
import { painelRpc } from "../../../lib/painel-rpc";

export type ExportCsvResult = { ok: true; file: ReportCsvExport } | { ok: false; message: string };

export async function exportReportCsv(period: ReportPeriodInput): Promise<ExportCsvResult> {
  const parsed = reportInputSchema.safeParse({ period });
  if (!parsed.success) return { ok: false, message: "Período inválido. Escolha outro." };
  const result = await painelRpc((api, caller) => api.reportsExportCsv(caller, parsed.data));
  if (!result.ok) {
    if (result.error === "unauthenticated") redirect("/entrar");
    return {
      ok: false,
      message:
        result.error === "invalid_input"
          ? "O período termina no futuro. Escolha até hoje."
          : RPC_ERROR_MESSAGE[result.error],
    };
  }
  return { ok: true, file: result.data };
}
