// Fixture do Storefront nos testes do `web`: Cardápio válido pelo `publicMenuSchema`,
// com destaque, grupos obrigatório/opcional, opção com preço (P-1.1) e item indisponível.
import { publicMenuSchema, type MenuItem, type PublicMenu } from "@foode/shared/menu";
import { storefrontStoreStateSchema, type StorefrontStoreState } from "@foode/shared/order";

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

// ---- Estado da Loja (Ticket 24a): aberta, com Delivery por bairro, Retirada e bandeiras.

export const neighborhoodIds = {
  centro: uuid("a1"),
  jardim: uuid("a2"),
} as const;

export const storeState: StorefrontStoreState = storefrontStoreStateSchema.parse({
  availability: { closesAt: "2026-11-05T02:00:00.000Z", state: "open" },
  cardBrands: { credit: ["visa", "mastercard", "elo"], debit: ["visa", "mastercard"] },
  delivery: {
    eta: { maxMinutes: 60, minMinutes: 40 },
    minimumOrderCents: 2000,
    mode: "neighborhood",
    neighborhoods: [
      { feeCents: 500, id: neighborhoodIds.centro, name: "Centro" },
      { feeCents: 800, id: neighborhoodIds.jardim, name: "Jardim América" },
    ],
  },
  hours: [
    { closesAt: "23:00", opensAt: "18:00", weekday: 1 },
    { closesAt: "23:00", opensAt: "18:00", weekday: 4 },
    { closesAt: "14:00", opensAt: "11:00", weekday: 5 },
    { closesAt: "23:00", opensAt: "18:00", weekday: 5 },
  ],
  name: "Lanchonete do Zé",
  paymentMethods: ["on_delivery"],
  pickup: {
    address: {
      city: "São Paulo",
      complement: null,
      district: "Centro",
      number: "100",
      state: "SP",
      street: "Rua das Flores",
    },
    eta: { maxMinutes: 20, minMinutes: 15 },
  },
  slug: "lanchonete-do-ze",
  whatsapp: "5511987654321",
} satisfies StorefrontStoreState);
