// Fixture compartilhada pelos testes do módulo de Cardápio. Não é exportada pelo pacote.
import type { MenuItem, PublicMenu } from "./schema.js";

/** UUID v4 sintético e estável a partir de um prefixo hexadecimal curto. */
export function uuid(seed: string): string {
  const hex = seed.padEnd(8, "0").slice(0, 8);
  return `${hex}-0000-4000-8000-000000000000`;
}

export const ids = {
  additionalBacon: uuid("b1"),
  additionalEggOff: uuid("b2"),
  category: uuid("c1"),
  groupBread: uuid("61"),
  groupSauces: uuid("62"),
  groupSteak: uuid("60"),
  optionBreadBrioche: uuid("71"),
  optionBreadWhole: uuid("72"),
  optionSauceBbq: uuid("73"),
  optionSauceMayo: uuid("74"),
  optionSauceMustard: uuid("75"),
  optionSteakMedium: uuid("76"),
  optionSteakRare: uuid("77"),
  soda: uuid("d2"),
  unavailableItem: uuid("d3"),
  burger: uuid("d1"),
} as const;

export const burger: MenuItem = {
  additionals: [
    { available: true, id: ids.additionalBacon, name: "Bacon", priceCents: 300 },
    { available: false, id: ids.additionalEggOff, name: "Ovo", priceCents: 200 },
  ],
  available: true,
  complementGroups: [
    {
      id: ids.groupSteak,
      maxSelect: 1,
      minSelect: 1,
      name: "Ponto da carne",
      options: [
        { id: ids.optionSteakRare, name: "Mal passado", priceCents: 0 },
        { id: ids.optionSteakMedium, name: "Ao ponto", priceCents: 0 },
      ],
    },
    {
      id: ids.groupBread,
      maxSelect: 1,
      minSelect: 0,
      name: "Pão",
      options: [
        { id: ids.optionBreadBrioche, name: "Brioche", priceCents: 250 },
        { id: ids.optionBreadWhole, name: "Integral", priceCents: 0 },
      ],
    },
    {
      id: ids.groupSauces,
      maxSelect: 2,
      minSelect: 0,
      name: "Molhos",
      options: [
        { id: ids.optionSauceBbq, name: "Barbecue", priceCents: 150 },
        { id: ids.optionSauceMayo, name: "Maionese", priceCents: 0 },
        { id: ids.optionSauceMustard, name: "Mostarda", priceCents: 0 },
      ],
    },
  ],
  description: "Pão, carne 160g e queijo.",
  featured: true,
  id: ids.burger,
  imageUrl: "https://img.example.com/stores/1/menu/burger.webp",
  name: "X-Burger",
  priceCents: 2500,
};

export const soda: MenuItem = {
  additionals: [],
  available: true,
  complementGroups: [],
  description: "",
  featured: false,
  id: ids.soda,
  imageUrl: null,
  name: "Refrigerante lata",
  priceCents: 600,
};

export const unavailableItem: MenuItem = {
  ...soda,
  available: false,
  id: ids.unavailableItem,
  name: "Suco (indisponível)",
};

export const publicMenu: PublicMenu = {
  categories: [{ id: ids.category, items: [burger, soda, unavailableItem], name: "Lanches" }],
  name: "Lanchonete do Zé",
  slug: "lanchonete-do-ze",
};
