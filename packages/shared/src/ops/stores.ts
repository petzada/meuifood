// Loja no Ops (Ticket 29, decisão 62): cadastro, edição, ativação/suspensão e modo do cartão.
// A Loja nasce `onboarding`; só `active` aceita Pedidos; `suspended` volta por reativação.
import { z } from "zod";

import { type StoreStatus, storeStatusSchema } from "../auth/schemas.js";
import {
  cnpjSchema,
  cpfOrCnpjSchema,
  pixKeySchema,
  storeAddressSchema,
  storeSlugSchema,
  whatsappSchema,
} from "./documents.js";

export { storeStatusSchema };

/** Modo do cartão (decisão 60, ADR 0007): Normal = Efí; Rápido = AbacatePay. */
export const CARD_MODES = ["normal", "rapido"] as const;
export type CardMode = (typeof CARD_MODES)[number];
export const cardModeSchema = z.enum(CARD_MODES);

/** Provedor de cada modo: fixo por Loja, sem fallback automático. */
export const CARD_MODE_PROVIDER = {
  normal: "efi",
  rapido: "abacatepay",
} as const satisfies Record<CardMode, "efi" | "abacatepay">;

/** Transições de estado que o Ops pode fazer. Ativar exige Plano vigente (regra da api). */
export const STORE_STATUS_TRANSITIONS: Readonly<Record<StoreStatus, readonly StoreStatus[]>> = {
  onboarding: ["active", "suspended"],
  active: ["suspended"],
  suspended: ["active"],
};

export function canTransitionStore(from: StoreStatus, to: StoreStatus): boolean {
  return STORE_STATUS_TRANSITIONS[from].includes(to);
}

const storeNameSchema = z.string().trim().min(1).max(120);

/** Titular e chave Pix para o repasse manual (lote diário, decisão 60). */
export const payoutAccountSchema = z.object({
  pixKey: pixKeySchema,
  holderName: z.string().trim().min(1).max(120),
  holderDocument: cpfOrCnpjSchema,
});

export type PayoutAccount = z.output<typeof payoutAccountSchema>;

const storeProfileShape = {
  name: storeNameSchema,
  cnpj: cnpjSchema,
  whatsapp: whatsappSchema,
  address: storeAddressSchema,
  payout: payoutAccountSchema,
};

/** Ops cadastra a Loja com tudo para começar; nasce `onboarding`. Slug único (409 = `conflict`). */
export const opsCreateStoreInputSchema = z.object({
  slug: storeSlugSchema,
  ...storeProfileShape,
});

/** Ops edita dados da Loja; só os campos enviados mudam (ao menos um). */
export const opsUpdateStoreInputSchema = z
  .object({
    storeId: z.uuid(),
    slug: storeSlugSchema.optional(),
    name: storeProfileShape.name.optional(),
    cnpj: storeProfileShape.cnpj.optional(),
    whatsapp: storeProfileShape.whatsapp.optional(),
    address: storeProfileShape.address.optional(),
    payout: storeProfileShape.payout.optional(),
  })
  .refine((input) => Object.keys(input).some((key) => key !== "storeId"), {
    message: "Nada para alterar.",
  });

export const opsStoreRefInputSchema = z.object({ storeId: z.uuid() });

/** Ativar (de `onboarding`) ou reativar (de `suspended`). */
export const opsActivateStoreInputSchema = opsStoreRefInputSchema;

/** Suspender: motivo vai para a auditoria. */
export const opsSuspendStoreInputSchema = z.object({
  storeId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});

/** Modo do cartão da Loja; não reescreve cobranças anteriores (snapshot na cobrança). */
export const opsSetCardModeInputSchema = z.object({
  storeId: z.uuid(),
  cardMode: cardModeSchema,
});

export type OpsCreateStoreInput = z.input<typeof opsCreateStoreInputSchema>;
export type OpsCreateStore = z.output<typeof opsCreateStoreInputSchema>;
export type OpsUpdateStoreInput = z.input<typeof opsUpdateStoreInputSchema>;
export type OpsUpdateStore = z.output<typeof opsUpdateStoreInputSchema>;
export type OpsStoreRefInput = z.input<typeof opsStoreRefInputSchema>;
export type OpsActivateStoreInput = z.input<typeof opsActivateStoreInputSchema>;
export type OpsSuspendStoreInput = z.input<typeof opsSuspendStoreInputSchema>;
export type OpsSetCardModeInput = z.input<typeof opsSetCardModeInputSchema>;
