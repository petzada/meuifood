import { OutlineContainer } from "@foode/ui";

import { SubmitButton } from "../team/submit-button";
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  reorderCategories,
  updateCategory,
  updateItem,
  uploadItemImage,
} from "./actions";

export type MenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type MenuItem = {
  available: boolean;
  categoryId: string;
  description: string;
  id: string;
  imageUrl: string | null;
  name: string;
  priceCents: number;
};

export type MenuFeedback =
  | "categoria-atualizada"
  | "categoria-com-itens"
  | "categoria-criada"
  | "categoria-erro"
  | "categoria-removida"
  | "foto-atualizada"
  | "foto-erro"
  | "item-atualizado"
  | "item-criado"
  | "item-erro"
  | "item-removido"
  | "ordem-atualizada"
  | "ordem-erro";

const feedbackMessages: Record<MenuFeedback, string> = {
  "categoria-atualizada": "Categoria atualizada.",
  "categoria-com-itens": "Remova ou mova os itens antes de apagar a categoria.",
  "categoria-criada": "Categoria criada.",
  "categoria-erro": "Não foi possível salvar a categoria.",
  "categoria-removida": "Categoria removida.",
  "foto-atualizada": "Foto do item atualizada.",
  "foto-erro": "Não foi possível enviar a foto.",
  "item-atualizado": "Item atualizado.",
  "item-criado": "Item criado.",
  "item-erro": "Não foi possível salvar o item.",
  "item-removido": "Item removido.",
  "ordem-atualizada": "Ordem das categorias atualizada.",
  "ordem-erro": "Não foi possível reordenar as categorias.",
};

function formatPrice(priceCents: number) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
}

function priceInputValue(priceCents: number) {
  return (priceCents / 100).toFixed(2);
}

export function MenuPanel({
  categories,
  feedback,
  items,
}: {
  categories: MenuCategory[];
  feedback?: MenuFeedback | undefined;
  items: MenuItem[];
}) {
  const orderedIds = categories.map(({ id }) => id).join(",");
  const reversedIds = [...categories]
    .map(({ id }) => id)
    .reverse()
    .join(",");

  return (
    <section id="cardapio" className="mx-auto mt-12 max-w-5xl scroll-mt-8">
      <h2 className="text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
        Cardápio
      </h2>
      <p className="mt-2 max-w-[60ch] text-[var(--color-body)]">
        Organize categorias e itens com preço em reais. Fotos usam Cloudflare R2 via upload autorizado.
      </p>

      {feedback ? (
        <p
          role={feedback.endsWith("erro") || feedback === "categoria-com-itens" ? "alert" : "status"}
          className="mt-5 rounded-xl border border-[var(--color-hairline)] px-4 py-3 text-sm font-bold text-[var(--color-body)]"
        >
          {feedbackMessages[feedback]}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <OutlineContainer className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-[var(--color-ink)]">Categorias e itens</h3>
            {categories.length > 1 ? (
              <form action={reorderCategories}>
                <input type="hidden" name="orderedCategoryIds" value={reversedIds || orderedIds} />
                <SubmitButton variant="secondary" className="w-full sm:w-auto">
                  Inverter ordem
                </SubmitButton>
              </form>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4">
            {categories.map((category) => {
              const categoryItems = items.filter((item) => item.categoryId === category.id);
              return (
                <div
                  key={category.id}
                  className="rounded-2xl border border-[var(--color-hairline-soft)] p-4"
                >
                  <form action={updateCategory} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <input type="hidden" name="categoryId" value={category.id} />
                    <label className="block text-sm font-bold text-[var(--color-ink)]">
                      Categoria
                      <input
                        className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                        defaultValue={category.name}
                        name="name"
                        required
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton variant="secondary">Salvar</SubmitButton>
                    </div>
                  </form>
                  <form action={deleteCategory} className="mt-2">
                    <input type="hidden" name="categoryId" value={category.id} />
                    <SubmitButton variant="secondary">Remover categoria</SubmitButton>
                  </form>

                  <div className="mt-4 grid gap-3">
                    {categoryItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-dashed border-[var(--color-hairline)] p-3"
                      >
                        <form action={updateItem} className="grid gap-3">
                          <input type="hidden" name="itemId" value={item.id} />
                          <label className="block text-sm font-bold text-[var(--color-ink)]">
                            Nome
                            <input
                              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                              defaultValue={item.name}
                              name="name"
                              required
                            />
                          </label>
                          <label className="block text-sm font-bold text-[var(--color-ink)]">
                            Descrição
                            <textarea
                              className="mt-2 min-h-20 w-full rounded-xl border border-[var(--color-hairline)] px-4 py-3 font-normal outline-none focus:border-[var(--color-primary)]"
                              defaultValue={item.description}
                              name="description"
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block text-sm font-bold text-[var(--color-ink)]">
                              Preço (R$)
                              <input
                                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                                defaultValue={priceInputValue(item.priceCents)}
                                inputMode="decimal"
                                name="priceReais"
                                required
                              />
                            </label>
                            <label className="block text-sm font-bold text-[var(--color-ink)]">
                              Categoria
                              <select
                                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                                defaultValue={item.categoryId}
                                name="categoryId"
                              >
                                {categories.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
                            <input
                              defaultChecked={item.available}
                              name="available"
                              type="checkbox"
                            />
                            Disponível no Storefront
                          </label>
                          <p className="text-sm text-[var(--color-muted)]">
                            Preço atual: {formatPrice(item.priceCents)}
                          </p>
                          {item.imageUrl ? (
                            <img
                              alt=""
                              className="h-28 w-full rounded-xl border border-[var(--color-hairline)] object-cover"
                              src={item.imageUrl}
                            />
                          ) : null}
                          <SubmitButton>Salvar item</SubmitButton>
                        </form>
                        <form action={uploadItemImage} className="mt-3 grid gap-3" encType="multipart/form-data">
                          <input type="hidden" name="itemId" value={item.id} />
                          <label className="block text-sm font-bold text-[var(--color-ink)]">
                            Foto (JPEG, PNG ou WebP até 5 MiB)
                            <input
                              accept="image/jpeg,image/png,image/webp"
                              className="mt-2 block w-full text-sm font-normal"
                              name="image"
                              type="file"
                            />
                          </label>
                          <SubmitButton variant="secondary">Enviar foto</SubmitButton>
                        </form>
                        <form action={deleteItem} className="mt-3">
                          <input type="hidden" name="itemId" value={item.id} />
                          <SubmitButton variant="secondary">Remover item</SubmitButton>
                        </form>
                      </div>
                    ))}
                    {categoryItems.length === 0 ? (
                      <p className="text-sm text-[var(--color-muted)]">
                        Nenhum item nesta categoria.
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {categories.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--color-hairline)] p-4 text-sm text-[var(--color-muted)]">
                Crie a primeira categoria para começar o Cardápio.
              </p>
            ) : null}
          </div>
        </OutlineContainer>

        <div className="grid gap-6">
          <OutlineContainer className="h-fit p-5 md:p-6">
            <h3 className="text-lg font-bold text-[var(--color-ink)]">Nova categoria</h3>
            <form action={createCategory} className="mt-5 space-y-4">
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Nome
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                  name="name"
                  placeholder="Lanches"
                  required
                />
              </label>
              <SubmitButton className="w-full">Criar categoria</SubmitButton>
            </form>
          </OutlineContainer>

          <OutlineContainer className="h-fit p-5 md:p-6">
            <h3 className="text-lg font-bold text-[var(--color-ink)]">Novo item</h3>
            <form action={createItem} className="mt-5 space-y-4">
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Categoria
                <select
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                  disabled={categories.length === 0}
                  name="categoryId"
                  required
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Nome
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                  name="name"
                  required
                />
              </label>
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Descrição
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-[var(--color-hairline)] px-4 py-3 font-normal outline-none focus:border-[var(--color-primary)]"
                  name="description"
                />
              </label>
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Preço (R$)
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                  defaultValue="0.00"
                  inputMode="decimal"
                  name="priceReais"
                  required
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
                <input defaultChecked name="available" type="checkbox" />
                Disponível
              </label>
              {categories.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  Crie uma categoria antes de adicionar itens.
                </p>
              ) : (
                <SubmitButton className="w-full">Criar item</SubmitButton>
              )}
            </form>
          </OutlineContainer>
        </div>
      </div>
    </section>
  );
}

export { feedbackMessages as menuFeedbackMessages };
