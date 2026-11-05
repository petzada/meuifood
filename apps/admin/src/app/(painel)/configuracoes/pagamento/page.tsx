import { OutlineContainer } from "@foode/ui";

import { painelRead } from "../../../../lib/painel-rpc";
import { requirePermission } from "../../../../lib/session";
import { saveCardBrands } from "../actions";
import { CardBrandsForm } from "../_components/payment-forms";
import { SettingsHeader } from "../_components/settings-nav";

// Bandeiras da maquininha (P-4.3). Só o Dono.
export const dynamic = "force-dynamic";

export default async function PagamentoPage() {
  await requirePermission("store.settings");
  const settings = await painelRead("Bandeiras", (api, caller) => api.storeOperationGet(caller));
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader current="/configuracoes/pagamento" />
      <OutlineContainer className="p-5 md:p-7">
        <CardBrandsForm action={saveCardBrands} initial={settings.cardBrands} />
      </OutlineContainer>
    </section>
  );
}
