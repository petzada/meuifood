import { OutlineContainer } from "@foode/ui";
import { redirect } from "next/navigation";

import { painelRead } from "../../../../../lib/painel-rpc";
import { requirePermission } from "../../../../../lib/session";
import { createItem, uploadMenuImage } from "../../actions";
import { ItemForm } from "../../_components/item-form";
import { CardapioPageHeader } from "../../_components/page-header";

// Novo item (CAR-05): só a seção Dados; Complementos e Adicionais entram depois de criar, na
// página do item (precisam do id).
export const dynamic = "force-dynamic";

export default async function NovoItemPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  await requirePermission("store.menu");
  const { categoria } = await searchParams;
  const menu = await painelRead("o Cardápio", (api, caller) => api.menuGet(caller));
  const category = menu.categories.find((c) => c.id === categoria) ?? menu.categories[0];
  if (!category) redirect("/cardapio");

  return (
    <section className="mx-auto max-w-4xl">
      <CardapioPageHeader
        crumbs={[
          { href: "/cardapio", label: "Cardápio" },
          { href: `/cardapio?categoria=${category.id}`, label: category.name },
        ]}
        title="Novo item"
        description={`O item entra no fim de ${category.name}. Depois dá para mover de categoria e reordenar.`}
      />
      <OutlineContainer className="mt-8 p-5 md:p-8">
        <ItemForm
          action={createItem}
          categories={menu.categories}
          categoryId={category.id}
          featuredCount={menu.featuredCount}
          item={null}
          upload={uploadMenuImage}
        />
      </OutlineContainer>
    </section>
  );
}
