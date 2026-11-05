// Componente: detalhe do item com etapas (I1–I8, G2). Obrigatório/opcional, contador,
// limite do grupo múltiplo, preço de opção e CTA que diz o que falta e leva até a pendência.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CartLine } from "@foode/shared/menu";

import { burger, ids, soda, unavailableItem } from "./fixtures";
import { ItemSheet, type ItemSheetProps } from "./item-sheet";

function renderSheet(props: Partial<ItemSheetProps> = {}) {
  const onSubmit = vi.fn<(line: CartLine) => void>();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <ItemSheet
      item={burger}
      onClose={onClose}
      onShare={vi.fn()}
      onSubmit={onSubmit}
      open
      {...props}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: props.item?.name ?? burger.name });
  return { dialog, onClose, onSubmit, user };
}

function group(dialog: HTMLElement, name: RegExp) {
  return within(dialog).getByRole("group", { name });
}

describe("ItemSheet (item com etapas)", () => {
  it("marca o grupo obrigatório, diz a instrução e o contador de cada grupo", () => {
    const { dialog } = renderSheet();
    const steak = group(dialog, /Ponto da carne/u);
    expect(within(steak).getByText("Obrigatório")).toBeInTheDocument();
    expect(within(steak).getByText("Escolha 1")).toBeInTheDocument();
    expect(within(steak).getByLabelText("0 de 1 escolhidos")).toHaveTextContent("0/1");

    const bread = group(dialog, /Pão/u);
    expect(within(bread).queryByText("Obrigatório")).not.toBeInTheDocument();
    expect(within(bread).getByText("Escolha até 1")).toBeInTheDocument();

    const sauces = group(dialog, /Molhos/u);
    expect(within(sauces).getByText("Escolha até 2")).toBeInTheDocument();
    expect(within(sauces).getAllByRole("checkbox")).toHaveLength(3);
    expect(within(steak).getAllByRole("radio")).toHaveLength(2);
  });

  it("CTA diz o que falta, não envia e leva o alerta ao grupo pendente", async () => {
    const { dialog, onSubmit, user } = renderSheet();
    const cta = within(dialog).getByRole("button", { name: "Escolha Ponto da carne" });
    expect(cta).toHaveAttribute("aria-disabled", "true");

    await user.click(cta);

    expect(onSubmit).not.toHaveBeenCalled();
    const steak = group(dialog, /Ponto da carne/u);
    expect(within(steak).getByRole("alert")).toBeInTheDocument();
    expect(steak).toHaveFocus();

    await user.click(within(steak).getByRole("radio", { name: /Ao ponto/u }));
    expect(within(steak).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(steak).getByLabelText("1 de 1 escolhidos")).toHaveTextContent("1/1");
  });

  it("soma o preço das opções e Adicionais no CTA e envia a linha escolhida", async () => {
    const { dialog, onSubmit, user } = renderSheet();
    await user.click(within(dialog).getByRole("radio", { name: /Mal passado/u }));
    expect(within(dialog).getByRole("button", { name: /^Adicionar · R\$\s25,00$/u })).toBeVisible();

    const brioche = within(dialog).getByRole("radio", { name: /Brioche/u });
    expect(brioche.closest("label")).toHaveTextContent("+ R$ 2,50");
    await user.click(brioche);
    await user.click(within(dialog).getByRole("checkbox", { name: /Bacon/u }));
    await user.click(within(dialog).getByRole("button", { name: "Aumentar quantidade" }));

    // (25,00 + 2,50 + 3,00) × 2
    const cta = within(dialog).getByRole("button", { name: /^Adicionar · R\$\s61,00$/u });
    await user.click(cta);

    expect(onSubmit).toHaveBeenCalledWith({
      additionalIds: [ids.additionalBacon],
      complementSelections: {
        [ids.groupSteak]: [ids.optionSteakRare],
        [ids.groupBread]: [ids.optionBreadBrioche],
      },
      itemId: ids.burger,
      quantity: 2,
    });
  });

  it("no máximo do grupo múltiplo bloqueia as outras opções e avisa", async () => {
    const { dialog, user } = renderSheet();
    const sauces = group(dialog, /Molhos/u);
    await user.click(within(sauces).getByRole("checkbox", { name: /Barbecue/u }));
    await user.click(within(sauces).getByRole("checkbox", { name: /Maionese/u }));

    expect(within(sauces).getByRole("checkbox", { name: /Mostarda/u })).toBeDisabled();
    expect(within(sauces).getByText(/Máximo de 2 atingido/u)).toBeInTheDocument();

    await user.click(within(sauces).getByRole("checkbox", { name: /Maionese/u }));
    expect(within(sauces).getByRole("checkbox", { name: /Mostarda/u })).toBeEnabled();
  });

  it("opcional de escolha única desmarca ao tocar de novo; Adicional indisponível fica travado", async () => {
    const { dialog, user } = renderSheet();
    const integral = within(dialog).getByRole("radio", { name: /Integral/u });
    await user.click(integral);
    expect(integral).toBeChecked();
    await user.click(integral);
    expect(integral).not.toBeChecked();

    expect(within(dialog).getByRole("checkbox", { name: /Ovo/u })).toBeDisabled();
  });

  it("item sem grupos já nasce pronto; item indisponível não tem CTA", () => {
    const { dialog } = renderSheet({ item: soda });
    expect(within(dialog).getByRole("button", { name: /^Adicionar · R\$\s6,00$/u })).toBeVisible();
  });

  it("item indisponível troca o CTA pelo aviso", () => {
    const { dialog } = renderSheet({ item: unavailableItem });
    expect(within(dialog).getByText("Este item está indisponível no momento.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /Adicionar/u })).not.toBeInTheDocument();
  });

  it("em edição reabre as escolhas da linha e o CTA vira Salvar", () => {
    const { dialog } = renderSheet({
      editingLine: {
        additionalIds: [],
        complementSelections: { [ids.groupSteak]: [ids.optionSteakMedium] },
        itemId: ids.burger,
        quantity: 3,
      },
    });
    expect(within(dialog).getByRole("radio", { name: /Ao ponto/u })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: /^Salvar · R\$\s75,00$/u })).toBeVisible();
  });
});
