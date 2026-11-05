import { Badge, OutlineContainer } from "@foode/ui";
import { formatBRL } from "@foode/shared/money";
import { notFound } from "next/navigation";

import { painelRead } from "../../../../../lib/painel-rpc";
import { requirePermission } from "../../../../../lib/session";
import { SectionHeading } from "../../../ops/_components/fields";
import {
  copyComplementGroups,
  createAdditional,
  createComplementGroup,
  deleteAdditional,
  deleteComplementGroup,
  deleteItem,
  reorderAdditionals,
  reorderComplementGroups,
  setAdditionalAvailable,
  updateAdditional,
  updateComplementGroup,
  updateItem,
  uploadMenuImage,
} from "../../actions";
import { AdditionalsSection } from "../../_components/additionals";
import { ComplementGroupsSection, type CopySource } from "../../_components/complement-groups";
import { ItemForm } from "../../_components/item-form";
import { CardapioPageHeader } from "../../_components/page-header";
import { ConfirmDialogForm } from "../../_components/quick-actions";
import { ToastNotice } from "../../../../../components/toast-notice";

// Item numa página só, em seções independentes (CAR-05, T-07): Dados (com foto, disponibilidade
// e Destaque) · Complementos · Adicionais · Apagar. Breadcrumb Cardápio › Categoria (NAV-06).
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  "item-criado": "Item criado. Agora monte os Complementos e Adicionais, se o item tiver.",
};

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  await requirePermission("store.menu");
  const [{ itemId }, { aviso }] = await Promise.all([params, searchParams]);
  const menu = await painelRead("o Cardápio", (api, caller) => api.menuGet(caller));

  const category = menu.categories.find((c) => c.items.some((i) => i.id === itemId));
  const item = category?.items.find((i) => i.id === itemId);
  if (!category || !item) notFound();

  const sources: CopySource[] = menu.categories.flatMap((c) =>
    c.items
      .filter((other) => other.id !== item.id)
      .map((other) => ({
        id: other.id,
        name: other.name,
        complementGroups: other.complementGroups,
        categoryName: c.name,
      })),
  );

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <CardapioPageHeader
        crumbs={[
          { href: "/cardapio", label: "Cardápio" },
          { href: `/cardapio?categoria=${category.id}`, label: category.name },
        ]}
        title={item.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{formatBRL(item.priceCents)}</span>
            {item.featured ? <Badge tone="accent">Destaque</Badge> : null}
            <Badge tone={item.available ? "success" : "error"}>
              {item.available ? "Disponível" : "Esgotado"}
            </Badge>
          </span>
        }
      />

      {aviso && NOTICES[aviso] ? <ToastNotice message={NOTICES[aviso]} /> : null}

      <OutlineContainer as="section" className="p-5 md:p-8" aria-labelledby="dados">
        <SectionHeading
          id="dados"
          description="Nome, preço, descrição e foto como o Consumidor vê."
        >
          Dados
        </SectionHeading>
        <div className="mt-6">
          <ItemForm
            action={updateItem}
            categories={menu.categories}
            categoryId={category.id}
            featuredCount={menu.featuredCount}
            item={item}
            upload={uploadMenuImage}
          />
        </div>
      </OutlineContainer>

      <OutlineContainer className="p-5 md:p-8">
        <ComplementGroupsSection
          actions={{
            copyComplementGroups,
            createComplementGroup,
            deleteComplementGroup,
            reorderComplementGroups,
            updateComplementGroup,
          }}
          item={item}
          sources={sources}
        />
      </OutlineContainer>

      <OutlineContainer className="p-5 md:p-8">
        <AdditionalsSection
          actions={{
            createAdditional,
            deleteAdditional,
            reorderAdditionals,
            setAdditionalAvailable,
            updateAdditional,
          }}
          item={item}
        />
      </OutlineContainer>

      <OutlineContainer as="section" className="p-5 md:p-8" aria-labelledby="apagar">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            id="apagar"
            description="Apagar tira o item do Cardápio com seus Complementos, Adicionais e foto. Para só tirar da venda hoje, use Esgotado."
          >
            Apagar item
          </SectionHeading>
          <ConfirmDialogForm
            action={deleteItem}
            confirmLabel="Apagar item"
            description={
              <p>
                <strong>{item.name}</strong> sai de {category.name} com todos os Complementos,
                Adicionais e a foto. Pedidos já feitos não mudam.
              </p>
            }
            hidden={{ itemId: item.id, categoryId: category.id }}
            title={`Apagar ${item.name}?`}
            trigger="Apagar item"
          />
        </div>
      </OutlineContainer>
    </section>
  );
}
