import { OutlineContainer } from "@foode/ui";

import { painelRead } from "../../../../lib/painel-rpc";
import { requirePermission } from "../../../../lib/session";
import { savePrintOnAccept } from "../actions";
import { PrintOnAcceptForm } from "../_components/payment-forms";
import { SettingsHeader } from "../_components/settings-nav";

// "Imprimir ao aceitar" (P-IMP-1). Só o Dono. Sem configuração de impressora (P-IMP-2).
export const dynamic = "force-dynamic";

export default async function ImpressaoPage() {
  await requirePermission("store.settings");
  const settings = await painelRead("Impressão", (api, caller) => api.storeOperationGet(caller));
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader current="/configuracoes/impressao" />
      <OutlineContainer className="p-5 md:p-7">
        <PrintOnAcceptForm action={savePrintOnAccept} initial={settings.printOnAccept} />
      </OutlineContainer>
      <p className="text-sm text-[var(--color-body)]">
        O cupom sai em 80 mm pelo navegador (Imprimir no detalhe do Pedido), com rodapé fixo. Não há
        configuração de impressora no Painel: escolha a impressora térmica na janela de impressão do
        navegador.
      </p>
    </section>
  );
}
