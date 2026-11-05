// Perfil do Dono no primeiro acesso (Ticket 28, P-ONB-4, decisão 63): duas perguntas fechadas
// (culinária e objetivo) com "Outro". Dado interno da Foode: gravado por Loja, lido pelo Dono da
// própria Loja e pelo Ops no detalhe da Loja; nunca exposto no Storefront. Respondido uma vez.
import { z } from "zod";

export const STORE_CUISINES = [
  "lanches",
  "pizza",
  "japonesa",
  "brasileira",
  "marmitas",
  "doces",
  "acai",
  "saudavel",
  "bebidas",
  "other",
] as const;
export type StoreCuisine = (typeof STORE_CUISINES)[number];

export const STORE_CUISINE_LABELS: Readonly<Record<StoreCuisine, string>> = {
  lanches: "Lanches e hambúrgueres",
  pizza: "Pizzaria",
  japonesa: "Japonesa",
  brasileira: "Brasileira e caseira",
  marmitas: "Marmitas",
  doces: "Doces e sobremesas",
  acai: "Açaí e sorvetes",
  saudavel: "Saudável",
  bebidas: "Bebidas",
  other: "Outro",
};

export const STORE_GOALS = [
  "start_delivery",
  "leave_marketplaces",
  "organize_whatsapp",
  "sell_more",
  "other",
] as const;
export type StoreGoal = (typeof STORE_GOALS)[number];

export const STORE_GOAL_LABELS: Readonly<Record<StoreGoal, string>> = {
  start_delivery: "Começar a vender por delivery",
  leave_marketplaces: "Pagar menos taxa que nos aplicativos",
  organize_whatsapp: "Organizar os Pedidos do WhatsApp",
  sell_more: "Vender mais com um canal próprio",
  other: "Outro",
};

/** Texto livre de "Outro" (= CHECK do D1). */
export const PROFILE_OTHER_MAX = 80;

const otherTextSchema = z.string().trim().min(1).max(PROFILE_OTHER_MAX).nullable().default(null);

/** "Outro" exige o texto; opção fechada descarta o texto (gravado como null). */
function withOther<T extends string>(values: readonly [T, ...T[]]) {
  return z
    .object({ value: z.enum(values), other: otherTextSchema })
    .refine((answer) => answer.value !== "other" || answer.other !== null, {
      message: "Conte qual é.",
      path: ["other"],
    })
    .transform((answer) => ({
      value: answer.value,
      other: answer.value === "other" ? answer.other : null,
    }));
}

export const ownerProfileInputSchema = z.object({
  cuisine: withOther(STORE_CUISINES),
  goal: withOther(STORE_GOALS),
});

export type OwnerProfileInput = z.input<typeof ownerProfileInputSchema>;
export type OwnerProfile = z.output<typeof ownerProfileInputSchema>;

/** Respostas como o Ops (detalhe da Loja) e o Dono leem. null = ainda não respondidas. */
export type OwnerProfileView = {
  cuisine: StoreCuisine;
  cuisineOther: string | null;
  goal: StoreGoal;
  goalOther: string | null;
  answeredAt: string;
};
