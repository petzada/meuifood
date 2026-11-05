import { OutlineContainer } from "@foode/ui";

import { painelRead, painelRpc } from "../../../../lib/painel-rpc";
import { requirePermission } from "../../../../lib/session";
import { saveDeliveryRate, saveFulfillment } from "../actions";
import { FulfillmentForm } from "../_components/fulfillment-form";
import { SettingsHeader } from "../_components/settings-nav";

// Entrega (CFG-03): Retirada, Delivery por bairro ou Taxa fixa, pedido mínimo e tempos. Só o Dono.
export const dynamic = "force-dynamic";

export default async function EntregaPage() {
  const session = await requirePermission("store.settings");
  const [settings, store] = await Promise.all([
    painelRead("Entrega", (api, caller) => api.storeOperationGet(caller)),
    // Bairro/cidade da Loja só alimentam a sugestão por km (decisão 73): falha = sem sugestão.
    painelRpc((api, caller) => api.storeSettingsGet(caller)).catch(() => null),
  ]);
  const address = store?.ok ? store.data.address : null;
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader current="/configuracoes/entrega" />
      <OutlineContainer className="p-5 md:p-7">
        <FulfillmentForm
          action={saveFulfillment}
          area={
            address
              ? { district: address.district, city: address.city, state: address.state }
              : null
          }
          initial={settings}
          saveRate={saveDeliveryRate}
          storeId={session.activeStore?.id ?? "loja"}
        />
      </OutlineContainer>
    </section>
  );
}
