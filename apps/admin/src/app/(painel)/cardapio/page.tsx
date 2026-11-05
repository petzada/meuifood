import { Button, OutlineContainer } from "@foode/ui";
import Link from "next/link";

import { pluralize } from "../../../lib/menu-labels";
import { painelRead } from "../../../lib/painel-rpc";
import { requirePermission } from "../../../lib/session";
import { SectionHeading } from "../ops/_components/fields";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  reorderCategories,
  reorderItems,
  setCategoryAvailable,
  setItemAvailable,
  setItemPrice,
} from "./actions";
import { CategoryPanel, NewCategoryForm } from "./_components/category-panel";
import { ItemsPanel } from "./_components/items-panel";
import { ToastNotice } from "../../../components/toast-notice";

// Gestor do Cardápio (Ticket 23, CAR-01): categorias à esquerda, itens da categoria à direita;
// no celular, empilhado. Só o Dono (`store.menu`); a api confere de novo em cada RPC.
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  "categoria-apagada": "Categoria apagada.",
  "item-apagado": "Item apagado do Cardápio.",
};

function OnboardingEmpty() {
  const steps = [
    ["Crie uma categoria", "Ex.: Lanches, Bebidas, Sobremesas. Elas organizam o Storefront."],
    ["Adicione os itens", "Nome, preço e foto. Deixe Esgotado o que não tem hoje."],
    [
      "Monte Complementos e Adicionais",
      "Escolhas do item (ponto da carne, sabor) e extras pagos (bacon, molho).",
    ],
  ] as const;
  return (
    <OutlineContainer className="mt-8 grid gap-8 p-6 md:grid-cols-[1.2fr_1fr] md:p-8">
      <div>
        <SectionHeading id="como-comecar">Seu Cardápio começa aqui.</SectionHeading>
        <ol className="mt-5 space-y-4">
          {steps.map(([title, text], index) => (
            <li key={title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-primary)] text-sm font-bold text-[var(--color-primary-strong)]"
              >
                {index + 1}
              </span>
              <div>
                <p className="font-bold text-[var(--color-ink)]">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--color-body)]">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-2xl border border-[var(--color-hairline)] p-5">
        <NewCategoryForm action={createCategory} autoFocus label="Primeira categoria" />
      </div>
    </OutlineContainer>
  );
}

export default async function CardapioPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; aviso?: string }>;
}) {
  await requirePermission("store.menu");
  const { categoria, aviso } = await searchParams;
  const menu = await painelRead("o Cardápio", (api, caller) => api.menuGet(caller));

  const selected =
    menu.categories.find((category) => category.id === categoria) ?? menu.categories[0] ?? null;
  const itemCount = menu.categories.reduce((sum, category) => sum + category.items.length, 0);

  return (
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
        {selected ? (
          <Button asChild>
            <Link href={`/cardapio/itens/novo?categoria=${selected.id}`}>Adicionar item</Link>
          </Button>
        ) : null}
      </header>

      {aviso && NOTICES[aviso] ? <ToastNotice message={NOTICES[aviso]} /> : null}

      {aviso === "categoria-criada" && selected ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-primary)] px-4 py-3">
          <p role="status" className="text-sm font-bold text-[var(--color-primary-strong)]">
            Categoria {selected.name} criada.
          </p>
          <Button asChild className="min-h-11 px-4 py-2 text-sm">
            <Link href={`/cardapio/itens/novo?categoria=${selected.id}`}>
              Adicionar item nesta categoria
            </Link>
          </Button>
        </div>
      ) : null}

      {selected === null ? (
        <OnboardingEmpty />
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
          <OutlineContainer className="p-5">
            <CategoryPanel
              categories={menu.categories}
              createCategory={createCategory}
              reorderCategories={reorderCategories}
              selectedId={selected.id}
            />
          </OutlineContainer>
          <OutlineContainer className="p-5 md:p-6">
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
          </OutlineContainer>
        </div>
      )}
    </section>
  );
}
