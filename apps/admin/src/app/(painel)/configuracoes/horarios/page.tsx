import { OutlineContainer } from "@foode/ui";

import { StoreStatusControl } from "../../../../components/store-status";
import { painelRead } from "../../../../lib/painel-rpc";
import { requirePermission } from "../../../../lib/session";
import { statusViewOf } from "../../../../lib/store-status";
import { setPause } from "../../loja/actions";
import { saveHours } from "../actions";
import { HoursForm } from "../_components/hours-form";
import { SettingsHeader } from "../_components/settings-nav";

// Horários (CFG-01) com a Pausa no topo (CFG-02: mesmo estado do selo do shell). Só o Dono.
export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  await requirePermission("store.settings");
  const settings = await painelRead("Horários", (api, caller) => api.storeOperationGet(caller));
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader current="/configuracoes/horarios" />
      <OutlineContainer className="space-y-3 p-5">
        <h2 className="text-lg font-bold text-[var(--color-ink)]">Pausa dos Pedidos</h2>
        <p className="text-sm leading-relaxed text-[var(--color-body)]">
          A Pausa bloqueia o checkout na hora, sem mexer nos horários. Dono e Operador podem ativar
          e retomar; cada mudança fica registrada.
        </p>
        <StoreStatusControl canPause setPause={setPause} status={statusViewOf(settings)} />
      </OutlineContainer>
      <OutlineContainer className="p-5 md:p-7">
        <HoursForm action={saveHours} initial={settings.hours} />
      </OutlineContainer>
    </section>
  );
}
