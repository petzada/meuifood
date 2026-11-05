import { painelRead } from "../../../../lib/painel-rpc";
import { requirePermission } from "../../../../lib/session";
import { PixelSection, StoreLinkPanel } from "../_components/promotion";
import { SettingsHeader } from "../_components/settings-nav";
import { savePixels } from "../loja-actions";

// Divulgação (LNK-01, LNK-03): link, QR Code e Pixel. Só o Dono.
export const dynamic = "force-dynamic";

export default async function DivulgacaoPage() {
  await requirePermission("store.settings");
  const settings = await painelRead("Divulgação", (api, caller) => api.storeSettingsGet(caller));
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader current="/configuracoes/divulgacao" />
      <StoreLinkPanel slug={settings.slug} storeUrl={settings.storeUrl} />
      <PixelSection action={savePixels} initial={settings} />
    </section>
  );
}
