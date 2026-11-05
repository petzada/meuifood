import { OutlineContainer } from "@foode/ui";

import { requirePermission } from "../../../../lib/session";
import { OpsPageHeader } from "../_components/page-header";
import { CreateStoreForm } from "../_components/store-form";
import { checkSlug, createStore } from "../actions";

// Cadastro de Loja numa página com seções (OPS-03). Ao salvar, vai para o detalhe.
export const dynamic = "force-dynamic";

export default async function NewStorePage() {
  await requirePermission("ops.area");
  return (
    <section className="mx-auto max-w-4xl">
      <OpsPageHeader
        crumbs={[{ href: "/ops", label: "Lojas" }]}
        title="Nova Loja"
        description="Cadastro completo para começar: Loja, Endereço e Repasse. Dono, Plano e cartão vêm na página da Loja."
      />
      <OutlineContainer className="mt-8 p-6 md:p-8">
        <CreateStoreForm action={createStore} checkSlug={checkSlug} />
      </OutlineContainer>
    </section>
  );
}
