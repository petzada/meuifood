import { OutlineContainer } from "@foode/ui";

import { SubmitButton } from "../team/submit-button";
import {
  createAdditional,
  createComplementGroup,
  deleteAdditional,
  deleteComplementGroup,
  reorderAdditionals,
  reorderComplementGroups,
  replaceComplementGroup,
  updateAdditional,
} from "./customization-actions";

export type ComplementOption = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ComplementGroup = {
  id: string;
  itemId: string;
  name: string;
  options: ComplementOption[];
  required: boolean;
  sortOrder: number;
};

export type Additional = {
  available: boolean;
  id: string;
  itemId: string;
  name: string;
  priceCents: number;
  sortOrder: number;
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

export function ItemCustomizationPanel({
  additionals,
  complementGroups,
  itemId,
  itemName,
}: {
  additionals: Additional[];
  complementGroups: ComplementGroup[];
  itemId: string;
  itemName: string;
}) {
  const itemGroups = complementGroups.filter((group) => group.itemId === itemId);
  const itemAdditionals = additionals.filter(
    (additional) => additional.itemId === itemId,
  );
  const reversedGroupIds = [...itemGroups]
    .reverse()
    .map(({ id }) => id)
    .join(",");
  const reversedAdditionalIds = [...itemAdditionals]
    .reverse()
    .map(({ id }) => id)
    .join(",");

  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-[var(--color-hairline-soft)] p-3">
      <h4 className="text-sm font-bold text-[var(--color-ink)]">
        Complementos e Adicionais de {itemName}
      </h4>

      {itemGroups.length > 1 ? (
        <form action={reorderComplementGroups}>
          <input name="itemId" type="hidden" value={itemId} />
          <input
            name="orderedGroupIds"
            type="hidden"
            value={reversedGroupIds}
          />
          <SubmitButton variant="secondary">
            Inverter grupos de Complementos
          </SubmitButton>
        </form>
      ) : null}

      <div className="grid gap-3">
        {itemGroups.map((group) => (
          <OutlineContainer key={group.id} className="p-3">
            <form action={replaceComplementGroup} className="grid gap-3">
              <input type="hidden" name="groupId" value={group.id} />
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Grupo de Complemento
                <input
                  className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                  defaultValue={group.name}
                  name="name"
                  required
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
                <input
                  defaultChecked={group.required}
                  name="required"
                  type="checkbox"
                />
                Obrigatório
              </label>
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Opções (uma por linha, na ordem)
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-[var(--color-hairline)] px-4 py-3 font-normal outline-none focus:border-[var(--color-primary)]"
                  defaultValue={group.options.map((option) => option.name).join("\n")}
                  name="options"
                  required={group.required}
                />
              </label>
              <SubmitButton variant="secondary">Salvar grupo</SubmitButton>
            </form>
            <form action={deleteComplementGroup} className="mt-2">
              <input type="hidden" name="groupId" value={group.id} />
              <SubmitButton variant="secondary">Remover grupo</SubmitButton>
            </form>
          </OutlineContainer>
        ))}
      </div>

      <form action={createComplementGroup} className="grid gap-3">
        <input type="hidden" name="itemId" value={itemId} />
        <label className="block text-sm font-bold text-[var(--color-ink)]">
          Novo grupo
          <input
            className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
            name="name"
            placeholder="Ponto da carne"
            required
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
          <input name="required" type="checkbox" />
          Obrigatório
        </label>
        <label className="block text-sm font-bold text-[var(--color-ink)]">
          Opções (uma por linha)
          <textarea
            className="mt-2 min-h-20 w-full rounded-xl border border-[var(--color-hairline)] px-4 py-3 font-normal outline-none focus:border-[var(--color-primary)]"
            name="options"
            placeholder={"Mal passado\nAo ponto"}
          />
        </label>
        <SubmitButton variant="secondary">Adicionar Complemento</SubmitButton>
      </form>

      <div className="grid gap-3">
        {itemAdditionals.length > 1 ? (
          <form action={reorderAdditionals}>
            <input name="itemId" type="hidden" value={itemId} />
            <input
              name="orderedAdditionalIds"
              type="hidden"
              value={reversedAdditionalIds}
            />
            <SubmitButton variant="secondary">
              Inverter ordem dos Adicionais
            </SubmitButton>
          </form>
        ) : null}
        {itemAdditionals.map((additional) => (
          <OutlineContainer key={additional.id} className="p-3">
            <form action={updateAdditional} className="grid gap-3">
              <input type="hidden" name="additionalId" value={additional.id} />
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Adicional
                <input
                  className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                  defaultValue={additional.name}
                  name="name"
                  required
                />
              </label>
              <label className="block text-sm font-bold text-[var(--color-ink)]">
                Preço (R$)
                <input
                  className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
                  defaultValue={priceInputValue(additional.priceCents)}
                  inputMode="decimal"
                  name="priceReais"
                  required
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
                <input
                  defaultChecked={additional.available}
                  name="available"
                  type="checkbox"
                />
                Disponível
              </label>
              <p className="text-sm text-[var(--color-muted)]">
                Atual: {formatPrice(additional.priceCents)}
              </p>
              <SubmitButton variant="secondary">Salvar Adicional</SubmitButton>
            </form>
            <form action={deleteAdditional} className="mt-2">
              <input type="hidden" name="additionalId" value={additional.id} />
              <SubmitButton variant="secondary">Remover Adicional</SubmitButton>
            </form>
          </OutlineContainer>
        ))}
      </div>

      <form action={createAdditional} className="grid gap-3">
        <input type="hidden" name="itemId" value={itemId} />
        <label className="block text-sm font-bold text-[var(--color-ink)]">
          Novo Adicional
          <input
            className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
            name="name"
            placeholder="Bacon"
            required
          />
        </label>
        <label className="block text-sm font-bold text-[var(--color-ink)]">
          Preço (R$)
          <input
            className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-hairline)] px-4 font-normal outline-none focus:border-[var(--color-primary)]"
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
        <SubmitButton variant="secondary">Adicionar Adicional</SubmitButton>
      </form>
    </div>
  );
}
