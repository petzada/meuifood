// Componente: formulário do item no Cardápio do Painel (CAR-05/06/07, P-5.5, T-06).
// Destaque no teto, erros da action nos campos e grupos de Complemento (obrigatório ×
// opcional pelo Mínimo, limite de opções). Server actions e upload são mocados.
import type { AdminComplementGroup, AdminMenuItem } from "@foode/shared/menu";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MAX_COMPLEMENT_OPTIONS } from "../../../../lib/menu-forms";
import { formError, IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ComplementGroupsSection, type ComplementActions } from "./complement-groups";
import { ItemForm } from "./item-form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const categories = [
  { id: "cat-lanches", name: "Lanches" },
  { id: "cat-bebidas", name: "Bebidas" },
];

const item: AdminMenuItem = {
  additionals: [],
  available: true,
  categoryId: "cat-lanches",
  complementGroups: [],
  description: "Pão, carne e queijo.",
  featured: false,
  id: "item-1",
  imageObjectKey: null,
  imageUrl: null,
  name: "X-Burger",
  priceCents: 2500,
};

function renderItemForm(props: {
  action?: Action;
  featuredCount?: number;
  item?: AdminMenuItem | null;
}) {
  const action = props.action ?? vi.fn<Action>(async () => IDLE_FORM);
  const user = userEvent.setup();
  render(
    <ItemForm
      action={action}
      categories={categories}
      categoryId="cat-lanches"
      featuredCount={props.featuredCount ?? 0}
      item={props.item ?? null}
      upload={vi.fn()}
    />,
  );
  return { action, user };
}

describe("ItemForm: Destaque e validação", () => {
  it("abaixo do teto o Destaque fica livre e mostra o contador", () => {
    renderItemForm({ featuredCount: 2 });
    const featured = screen.getByRole("checkbox", { name: /Destaque/u });
    expect(featured).toBeEnabled();
    expect(featured).toHaveAccessibleDescription(/Destaques: 2 de 4/u);
  });

  it("no teto de Destaques o item novo não pode ser marcado e o aviso diz o que fazer", () => {
    renderItemForm({ featuredCount: 4 });
    const featured = screen.getByRole("checkbox", { name: /Destaque/u });
    expect(featured).toBeDisabled();
    expect(featured).toHaveAccessibleDescription(
      "A Loja já tem 4 Destaques. Para marcar este item, tire outro dos Destaques.",
    );
  });

  it("item que já é Destaque continua editável no teto (pode sair dos Destaques)", () => {
    renderItemForm({ featuredCount: 4, item: { ...item, featured: true } });
    const featured = screen.getByRole("checkbox", { name: /Destaque/u });
    expect(featured).toBeEnabled();
    expect(featured).toBeChecked();
    expect(featured).toHaveAccessibleDescription(/Destaques: 3 de 4/u);
  });

  it("criação envia o formulário e mostra os erros da action nos campos", async () => {
    const action = vi.fn<Action>(async () =>
      formError(
        { featured: "A Loja já tem 4 Destaques.", name: "Informe o nome do item." },
        "Confira os campos destacados.",
      ),
    );
    const { user } = renderItemForm({ action });
    await user.type(screen.getByLabelText("Preço (R$)"), "12,90");
    await user.click(screen.getByRole("button", { name: "Criar item" }));

    expect(await screen.findByText("Informe o nome do item.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do item")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("A Loja já tem 4 Destaques.")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Confira os campos destacados.")).toHaveAttribute("role", "alert");
    const sent = action.mock.calls[0]?.[1];
    expect(sent?.get("categoryId")).toBe("cat-lanches");
    expect(sent?.get("priceCents")).toBe("12,90");
  });

  it("edição só habilita Salvar com mudança e permite mover de categoria", async () => {
    const { user } = renderItemForm({ item });
    const save = screen.getByRole("button", { name: "Salvar alterações" });
    expect(save).toBeDisabled();
    expect(screen.getByText("Nenhuma alteração para salvar.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Categoria/u), "cat-bebidas");
    expect(save).toBeEnabled();
  });

  it("contador da descrição acompanha o texto", async () => {
    const { user } = renderItemForm({});
    const description = screen.getByLabelText(/Descrição/u);
    await user.type(description, "Molho da casa");
    expect(screen.getByText("13 de 600 caracteres.")).toBeInTheDocument();
  });
});

function actions(): ComplementActions {
  const idle = vi.fn<Action>(async () => IDLE_FORM);
  return {
    copyComplementGroups: idle,
    createComplementGroup: idle,
    deleteComplementGroup: idle,
    reorderComplementGroups: idle,
    updateComplementGroup: idle,
  };
}

function group(overrides: Partial<AdminComplementGroup> = {}): AdminComplementGroup {
  return {
    id: "grp-1",
    maxSelect: 1,
    minSelect: 1,
    name: "Ponto da carne",
    options: [
      { id: "opt-1", name: "Mal passado", priceCents: 0 },
      { id: "opt-2", name: "Ao ponto", priceCents: 0 },
    ],
    ...overrides,
  };
}

describe("ComplementGroupsSection: grupos de Complemento", () => {
  it("lista cada grupo com o selo do Mínimo e a frase-resumo", () => {
    render(
      <ComplementGroupsSection
        actions={actions()}
        item={{
          ...item,
          complementGroups: [
            group(),
            group({ id: "grp-2", maxSelect: 2, minSelect: 0, name: "Molhos" }),
          ],
        }}
        sources={[]}
      />,
    );
    const [steak, sauces] = screen.getAllByRole("listitem");
    expect(within(steak!).getByText("Obrigatório")).toBeInTheDocument();
    expect(within(steak!).getByText("O Consumidor precisa escolher 1 opção.")).toBeInTheDocument();
    expect(within(sauces!).getByText("Opcional")).toBeInTheDocument();
    expect(
      within(sauces!).getByText("O Consumidor pode escolher até 2 opções, se quiser."),
    ).toBeInTheDocument();
  });

  it("novo grupo nasce opcional e vira obrigatório ao subir o Mínimo", async () => {
    const user = userEvent.setup();
    render(<ComplementGroupsSection actions={actions()} item={item} sources={[]} />);
    expect(screen.getByText("Este item ainda não tem Complementos.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Novo grupo" }));
    expect(screen.getByText("Opcional")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "O Consumidor pode escolher 1 opção, se quiser.",
    );
    expect(screen.getByRole("button", { name: "Diminuir mínimo" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Aumentar mínimo" }));
    expect(screen.getByText("Obrigatório")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("O Consumidor precisa escolher 1 opção.");
  });

  it("Mínimo acima do Máximo acusa o erro no campo", async () => {
    const user = userEvent.setup();
    render(<ComplementGroupsSection actions={actions()} item={item} sources={[]} />);
    await user.click(screen.getByRole("button", { name: "Novo grupo" }));
    await user.click(screen.getByRole("button", { name: "Aumentar mínimo" }));
    await user.click(screen.getByRole("button", { name: "Aumentar mínimo" }));

    expect(screen.getByLabelText("Mínimo")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Mínimo")).toHaveAccessibleDescription(
      "O mínimo não pode ser maior que o máximo.",
    );

    await user.click(screen.getByRole("button", { name: "Aumentar máximo" }));
    expect(screen.getByLabelText("Mínimo")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("status")).toHaveTextContent("O Consumidor precisa escolher 2 opções.");
  });

  it("no limite de opções a última não sai e Nova opção trava no teto", async () => {
    const user = userEvent.setup();
    const options = Array.from({ length: MAX_COMPLEMENT_OPTIONS }, (_, i) => ({
      id: `opt-${i}`,
      name: `Sabor ${i + 1}`,
      priceCents: 0,
    }));
    render(
      <ComplementGroupsSection
        actions={actions()}
        item={{ ...item, complementGroups: [group({ maxSelect: 3, minSelect: 0, options })] }}
        sources={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(
      screen.getByText(`Opções · ${MAX_COMPLEMENT_OPTIONS} de ${MAX_COMPLEMENT_OPTIONS}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova opção" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar grupo" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Remover opção Sabor 40" }));
    expect(screen.getByRole("button", { name: "Nova opção" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salvar grupo" })).toBeEnabled();
  });

  it("a única opção do grupo novo não pode ser removida", async () => {
    const user = userEvent.setup();
    render(<ComplementGroupsSection actions={actions()} item={item} sources={[]} />);
    await user.click(screen.getByRole("button", { name: "Novo grupo" }));
    expect(screen.getByRole("button", { name: "Remover opção 1" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Nova opção" }));
    expect(screen.getByRole("button", { name: "Remover opção 1" })).toBeEnabled();
    expect(screen.getByLabelText("Opção 2")).toBeInTheDocument();
  });
});
