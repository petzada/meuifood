// Fixture do Storefront nos testes do `web`: Cardápio válido pelo `publicMenuSchema`,
// com destaque, grupos obrigatório/opcional, opção com preço (P-1.1) e item indisponível.
import { publicMenuSchema, type MenuItem, type PublicMenu } from "@foode/shared/menu";

export function uuid(seed: string): string {
  const hex = seed.padEnd(8, "0").slice(0, 8);
  return `${hex}-0000-4000-8000-000000000000`;
}

export const ids = {
  additionalBacon: uuid("b1"),
  additionalEggOff: uuid("b2"),
  burger: uuid("d1"),
  categoryDrinks: uuid("c2"),
  categoryLanches: uuid("c1"),
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
  description: "Lata 350 ml",
  featured: false,
  id: ids.soda,
  imageUrl: null,
  name: "Refrigerante lata",
  priceCents: 600,
};

export const unavailableItem: MenuItem = {
  ...soda,
  available: false,
  description: "",
  id: ids.unavailableItem,
  name: "Suco de laranja",
};

export const publicMenu: PublicMenu = publicMenuSchema.parse({
  categories: [
    { id: ids.categoryLanches, items: [burger, unavailableItem], name: "Lanches" },
    { id: ids.categoryDrinks, items: [soda], name: "Bebidas" },
  ],
  name: "Lanchonete do Zé",
  slug: "lanchonete-do-ze",
} satisfies PublicMenu);
