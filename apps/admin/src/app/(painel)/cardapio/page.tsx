import { OutlineContainer } from "@foode/ui";

import { ToastNotice } from "../../../components/toast-notice";
import { pluralize } from "../../../lib/menu-labels";
import { painelRead } from "../../../lib/painel-rpc";
import { requirePermission } from "../../../lib/session";
import { EmptyState } from "../ops/_components/fields";
import {
  copyComplementGroups,
  createAdditional,
  createCategory,
  createComplementGroup,
  deleteAdditional,
  deleteCategory,
  deleteComplementGroup,
  deleteItem,
  renameCategory,
  reorderAdditionals,
  reorderCategories,
  reorderComplementGroups,
  reorderItems,
  saveItemDraft,
  setAdditionalAvailable,
  setCategoryAvailable,
  setItemAvailable,
  setItemPrice,
  updateAdditional,
  updateComplementGroup,
  uploadMenuImage,
} from "./actions";
import {
  CardapioCadastros,
  OpenCadastroButton,
  type CardapioModal,
} from "./_components/cardapio-cadastros";
import { CategoryPanel } from "./_components/category-panel";
import { ItemsPanel } from "./_components/items-panel";

// Gestor do Cardápio (Ticket 23, CAR-01): categorias à esquerda, itens da categoria à direita;
// no celular, empilhado. Só o Dono (`store.menu`); a api confere de novo em cada RPC.
// Decisão 74: um CTA principal só ("Adicionar item", no topo) e "Criar categoria" à esquerda;
// todo cadastro/edição abre em modal (etapas no cadastro do item, abas na edição).
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  "categoria-apagada": "Categoria apagada.",
  "item-apagado": "Item apagado do Cardápio.",
};

export default async function CardapioPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; aviso?: string; novo?: string; item?: string }>;
}) {
  await requirePermission("store.menu");
  const { categoria, aviso, novo, item: itemParam } = await searchParams;
  const menu = await painelRead("o Cardápio", (api, caller) => api.menuGet(caller));

  const ofItem = itemParam
    ? menu.categories.find((category) => category.items.some((i) => i.id === itemParam))
    : undefined;
  const selected =
    ofItem ??
    menu.categories.find((category) => category.id === categoria) ??
    menu.categories[0] ??
    null;
  const itemCount = menu.categories.reduce((sum, category) => sum + category.items.length, 0);

  const initial: CardapioModal =
    ofItem && itemParam
      ? { kind: "edit-item", itemId: itemParam }
      : novo === "item"
        ? { kind: "new-item", categoryId: selected?.id ?? null }
        : novo === "categoria"
          ? { kind: "new-category" }
          : null;

  return (
    <CardapioCadastros
      actions={{
        copyComplementGroups,
        createAdditional,
        createCategory,
        createComplementGroup,
        deleteAdditional,
        deleteComplementGroup,
        deleteItem,
        reorderAdditionals,
        reorderComplementGroups,
        saveItemDraft,
        setAdditionalAvailable,
        updateAdditional,
        updateComplementGroup,
        uploadMenuImage,
      }}
      initial={initial}
      menu={menu}
      selectedCategoryId={selected?.id ?? null}
    >
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-[var(--color-primary-strong)]">Loja</p>
            <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
              Cardápio
            </h1>
            <p className="mt-2 max-w-[60ch] leading-relaxed text-[var(--color-body)]">
              {menu.categories.length === 0
                ? "O que você cadastra aqui é o que o Consumidor vê no Storefront."
                : `${pluralize(menu.categories.length, "categoria", "categorias")} · ${pluralize(itemCount, "item", "itens")} · Destaques: ${menu.featuredCount} de ${menu.maxFeatured}`}
            </p>
          </div>
          <OpenCadastroButton modal={{ kind: "new-item", categoryId: selected?.id ?? null }}>
            Adicionar item
          </OpenCadastroButton>
        </header>

        {aviso && NOTICES[aviso] ? <ToastNotice message={NOTICES[aviso]} /> : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
          <OutlineContainer className="p-5">
            <CategoryPanel
              categories={menu.categories}
              reorderCategories={reorderCategories}
              selectedId={selected?.id ?? null}
            />
          </OutlineContainer>
          <OutlineContainer className="p-5 md:p-6">
            {selected ? (
              <ItemsPanel
                key={selected.id}
                actions={{
                  deleteCategory,
                  renameCategory,
                  reorderItems,
                  setCategoryAvailable,
                  setItemAvailable,
                  setItemPrice,
                }}
                category={selected}
              />
            ) : (
              <EmptyState title="Seu Cardápio começa aqui.">
                <p>
                  Use <strong>Adicionar item</strong> no topo: nome, preço e foto, com a categoria
                  criada junto. Depois, Complementos (ponto da carne, sabor) e Adicionais (bacon,
                  molho extra), se o item tiver.
                </p>
              </EmptyState>
            )}
          </OutlineContainer>
        </div>
      </section>
    </CardapioCadastros>
  );
}
