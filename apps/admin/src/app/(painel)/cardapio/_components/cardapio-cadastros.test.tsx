// Componente (decisão 74): cadastros do Cardápio em modal. Item em etapas (Dados → Complementos
// → Adicionais, puláveis) que fecha com Toast; 1º item sem categoria cria a categoria junto;
// categoria nova em modal; edição do item em abas. Server actions são vi.fn(); o "servidor"
// devolve o Cardápio novo pelo estado do harness (como o revalidatePath faria).
import type { AdminMenu, AdminMenuItem } from "@foode/shared/menu";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { render } from "../../../../test/render";
import type { CreatedState } from "../actions";
import {
  CardapioCadastros,
  OpenCadastroButton,
  type CardapioCadastroActions,
} from "./cardapio-cadastros";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const CAT = "11111111-1111-4111-8111-111111111111";
const NEW_CAT = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

function newItem(name: string, categoryId: string): AdminMenuItem {
  return {
    additionals: [],
    available: true,
    categoryId,
    complementGroups: [],
    description: "",
    featured: false,
    id: ITEM,
    imageObjectKey: null,
    imageUrl: null,
    name,
    priceCents: 1290,
  };
}

const WITH_CATEGORY: AdminMenu = {
  categories: [{ id: CAT, name: "Lanches", available: true, items: [] }],
  featuredCount: 0,
  maxFeatured: 4,
};

let setServerMenu: (menu: AdminMenu) => void = () => undefined;

function actions(overrides: Partial<CardapioCadastroActions> = {}): CardapioCadastroActions {
  const idle = vi.fn<Action>(async () => IDLE_FORM);
  return {
    copyComplementGroups: idle,
    createAdditional: idle,
    createCategory: idle,
    createComplementGroup: idle,
    deleteAdditional: idle,
    deleteComplementGroup: idle,
    deleteItem: idle,
    reorderAdditionals: idle,
    reorderComplementGroups: idle,
    saveItemDraft: idle,
    setAdditionalAvailable: idle,
    updateAdditional: idle,
    updateComplementGroup: idle,
    uploadMenuImage: vi.fn(),
    ...overrides,
  };
}

function Harness({ initial, acts }: { initial: AdminMenu; acts: CardapioCadastroActions }) {
  const [menu, setMenu] = useState(initial);
  setServerMenu = setMenu;
  return (
    <CardapioCadastros
      actions={acts}
      initial={null}
      menu={menu}
      selectedCategoryId={menu.categories[0]?.id ?? null}
    >
      <OpenCadastroButton modal={{ kind: "new-item", categoryId: menu.categories[0]?.id ?? null }}>
        Adicionar item
      </OpenCadastroButton>
      <OpenCadastroButton modal={{ kind: "new-category" }} variant="secondary">
        Criar categoria
      </OpenCadastroButton>
      {menu.categories.flatMap((category) =>
        category.items.map((item) => (
          <OpenCadastroButton key={item.id} modal={{ kind: "edit-item", itemId: item.id }}>
            {`Editar ${item.name}`}
          </OpenCadastroButton>
        )),
      )}
    </CardapioCadastros>
  );
}

beforeEach(() => {
  replace.mockClear();
});

describe("Cardápio: cadastro de item em etapas", () => {
  it("Dados → Complementos → Adicionais com Pular; concluir fecha e mostra o Toast", async () => {
    const user = userEvent.setup();
    const saveItemDraft = vi.fn<Action>(async (_prev, formData) => {
      const name = String(formData.get("name"));
      setServerMenu({
        ...WITH_CATEGORY,
        categories: [{ ...WITH_CATEGORY.categories[0]!, items: [newItem(name, CAT)] }],
      });
      const state: CreatedState = {
        ...IDLE_FORM,
        status: "success",
        itemId: ITEM,
        categoryId: CAT,
      };
      return state;
    });
    render(<Harness initial={WITH_CATEGORY} acts={actions({ saveItemDraft })} />);

    await user.click(screen.getByRole("button", { name: "Adicionar item" }));
    const dialog = screen.getByRole("dialog", { name: "Novo item" });
    expect(within(dialog).getByLabelText("Categoria")).toHaveValue(CAT);
    // Sem o link antigo "Configurar complementos e adicionais para esse item agora".
    expect(within(dialog).queryByText(/Configurar complementos/u)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Nome do item"), "Misto Quente");
    await user.type(within(dialog).getByLabelText("Preço (R$)"), "1290");
    await user.click(within(dialog).getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("region", { name: "Etapa: Complementos" })).toBeVisible();
    expect(saveItemDraft).toHaveBeenCalledTimes(1);
    expect(saveItemDraft.mock.calls[0]?.[1].get("categoryId")).toBe(CAT);
    expect(screen.getByText("Este item ainda não tem Complementos.")).toBeInTheDocument();

    // Voltar à etapa Dados mantém o que foi digitado; Continuar sem mudança não salva de novo.
    await user.click(screen.getAllByRole("button", { name: "Voltar" })[0]!);
    expect(screen.getByLabelText("Nome do item")).toHaveValue("Misto Quente");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(saveItemDraft).toHaveBeenCalledTimes(1);

    await user.click(
      within(screen.getByRole("region", { name: "Etapa: Complementos" })).getByRole("button", {
        name: "Pular",
      }),
    );
    const additionals = screen.getByRole("region", { name: "Etapa: Adicionais" });
    expect(additionals).toBeVisible();
    await user.click(within(additionals).getByRole("button", { name: "Concluir" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Misto Quente adicionado ao Cardápio.",
    );
  });

  it("sem categoria, o 1º item pede o nome da categoria (criada junto)", async () => {
    const user = userEvent.setup();
    const saveItemDraft = vi.fn<Action>(async () => IDLE_FORM);
    render(
      <Harness
        initial={{ categories: [], featuredCount: 0, maxFeatured: 4 }}
        acts={actions({ saveItemDraft })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Adicionar item" }));
    const dialog = screen.getByRole("dialog", { name: "Novo item" });
    expect(within(dialog).queryByLabelText("Categoria")).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Nome do item"), "Coxinha");
    await user.type(within(dialog).getByLabelText("Categoria do item"), "Salgados");
    await user.click(within(dialog).getByRole("button", { name: "Continuar" }));
    const sent = saveItemDraft.mock.calls[0]?.[1];
    expect(sent?.get("categoryId")).toBe("nova");
    expect(sent?.get("newCategoryName")).toBe("Salgados");
  });

  it("Esc com dados digitados pergunta antes de descartar", async () => {
    const user = userEvent.setup();
    render(<Harness initial={WITH_CATEGORY} acts={actions()} />);
    await user.click(screen.getByRole("button", { name: "Adicionar item" }));
    await user.type(screen.getByLabelText("Nome do item"), "X");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: "Descartar as alterações?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Cardápio: categoria e edição", () => {
  it("Criar categoria em modal: fecha, abre a categoria nova e mostra o Toast", async () => {
    const user = userEvent.setup();
    const createCategory = vi.fn<Action>(async () => {
      const state: CreatedState = {
        status: "success",
        errors: {},
        message: "Categoria Bebidas criada.",
        categoryId: NEW_CAT,
      };
      return state;
    });
    render(<Harness initial={WITH_CATEGORY} acts={actions({ createCategory })} />);
    await user.click(screen.getByRole("button", { name: "Criar categoria" }));
    const dialog = screen.getByRole("dialog", { name: "Nova categoria" });
    await user.type(within(dialog).getByLabelText("Nome da categoria"), "Bebidas");
    await user.click(within(dialog).getByRole("button", { name: "Criar categoria" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Categoria Bebidas criada.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(`/cardapio?categoria=${NEW_CAT}`, { scroll: false });
  });

  it("edição do item abre as mesmas etapas como abas", async () => {
    const user = userEvent.setup();
    const menu: AdminMenu = {
      ...WITH_CATEGORY,
      categories: [{ ...WITH_CATEGORY.categories[0]!, items: [newItem("Misto", CAT)] }],
    };
    render(<Harness initial={menu} acts={actions()} />);
    await user.click(screen.getByRole("button", { name: "Editar Misto" }));
    const dialog = screen.getByRole("dialog", { name: "Misto" });
    const tabs = within(dialog).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Dados",
      "Complementos (0)",
      "Adicionais (0)",
    ]);
    expect(within(dialog).getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
    await user.click(within(dialog).getByRole("tab", { name: "Adicionais (0)" }));
    expect(within(dialog).getByRole("button", { name: "Criar Adicional" })).toBeVisible();
  });
});
