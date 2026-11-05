import { type OwnerPayoutsView, ownerPayoutsInputSchema } from "@foode/shared/finance";
import { redirect } from "next/navigation";

import {
  defaultPayoutRange,
  rangeFromSearchParams,
  saoPauloToday,
  type SearchParamsLike,
} from "../../../lib/finance-labels";
import { painelRpc } from "../../../lib/painel-rpc";
import { requirePermission } from "../../../lib/session";
import { PayoutsView } from "./_components/payouts-view";

// `/repasses` (Ticket 14; REL-04, decisões 60, 61 e 71): só o Dono (`store.finance`), só leitura.
// Lançamentos com status (Previsto / Em lote / Pago / Débito de Estorno), totais por status e
// lotes pagos. Nunca custo do provedor nem custo do envio. Período pela URL (`?de=…&ate=…`).
export const dynamic = "force-dynamic";

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsLike>;
}) {
  await requirePermission("store.finance");
  const today = saoPauloToday();
  const range = rangeFromSearchParams((await searchParams) ?? {}, defaultPayoutRange(today));
  const input = ownerPayoutsInputSchema.safeParse(range);
  let view: OwnerPayoutsView | null = null;
  let invalid = !input.success;
  if (input.success) {
    const result = await painelRpc((api, caller) => api.payoutsGet(caller, input.data));
    if (result.ok) view = result.data;
    else if (result.error === "invalid_input") invalid = true;
    else if (result.error === "unauthenticated") redirect("/entrar");
    else if (result.error === "forbidden") redirect("/");
    else throw new Error(`Falha ao carregar os Repasses (${result.error}).`);
  }
  return <PayoutsView invalid={invalid} range={range} view={view} />;
}
