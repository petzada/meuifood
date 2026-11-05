import { painelRead } from "../../../../lib/painel-rpc";
import { requirePermission } from "../../../../lib/session";
import { storefrontOrigin } from "../../../../lib/storefront-origin";
import { SettingsHeader } from "../_components/settings-nav";
import {
  AddressSection,
  ContactSection,
  RegistrationFacts,
  ShowcaseSection,
  SlugSection,
} from "../_components/store-data-forms";
import {
  checkStoreSlug,
  saveAddress,
  saveContact,
  saveShowcase,
  saveSlug,
  uploadBrandImage,
} from "../loja-actions";

// Dados da Loja (CFG-04, LNK-02, P-CFG-4, P-VIS-1..3). Só o Dono.
export const dynamic = "force-dynamic";

export default async function LojaPage() {
  await requirePermission("store.settings");
  const settings = await painelRead("Dados da Loja", (api, caller) => api.storeSettingsGet(caller));
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader current="/configuracoes/loja" />
      <SlugSection
        action={saveSlug}
        checkSlug={checkStoreSlug}
        initial={settings}
        origin={storefrontOrigin()}
      />
      <ContactSection action={saveContact} initial={settings} />
      <AddressSection action={saveAddress} initial={settings.address} />
      <ShowcaseSection action={saveShowcase} initial={settings} upload={uploadBrandImage} />
      <RegistrationFacts name={settings.name} registration={settings.registration} />
    </section>
  );
}
