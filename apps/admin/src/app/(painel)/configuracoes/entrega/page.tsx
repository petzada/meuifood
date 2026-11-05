import { OutlineContainer } from "@foode/ui";

import { painelRead } from "../../../../lib/painel-rpc";
import { requirePermission } from "../../../../lib/session";
import { saveFulfillment } from "../actions";
import { FulfillmentForm } from "../_components/fulfillment-form";
import { SettingsHeader } from "../_components/settings-nav";

// Entrega (CFG-03): Retirada, Delivery por bairro ou Taxa fixa, pedido mínimo e tempos. Só o Dono.
export const dynamic = "force-dynamic";

export default async function EntregaPage() {
  await requirePermission("store.settings");
  const settings = await painelRead("Entrega", (api, caller) => api.storeOperationGet(caller));
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader current="/configuracoes/entrega" />
      <OutlineContainer className="p-5 md:p-7">
        <FulfillmentForm action={saveFulfillment} initial={settings} />
      </OutlineContainer>
    </section>
  );
}
