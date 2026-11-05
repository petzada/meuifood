// Configuração operacional da Loja que o checkout lê e o Painel edita (Ticket 24a é dono do
// contrato; 24b faz as telas e RPCs): Pausa, Retirada, Delivery por bairro (com interruptor) ou
// Taxa fixa (decisão 42), pedido mínimo do Delivery (P-2.5/P-CFG-2), tempo estimado mín–máx por
// Fulfillment (P-2.4/P-CFG-1), bandeiras da maquininha (P-4.3) e "Imprimir ao aceitar" (P-IMP-1).
// Horários ficam em hours.ts. Limites iguais aos CHECKs do D1 (schema/store-operation.ts).
import { z } from "zod";

import { centsSchema } from "../money.js";
import { normalizeNeighborhoodKey } from "../neighborhood.js";
import { type OpeningPeriod, openingHoursSchema } from "./hours.js";

// ---- Bandeiras aceitas na maquininha (P-4.3): lista curta fixa, separada em Débito e Crédito.

export const CARD_BRANDS = ["visa", "mastercard", "elo", "hipercard"] as const;
export const cardBrandSchema = z.enum(CARD_BRANDS);
export type CardBrand = z.infer<typeof cardBrandSchema>;

export const CARD_BRAND_LABELS: Readonly<Record<CardBrand, string>> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  hipercard: "Hipercard",
};

const brandListSchema = z
  .array(cardBrandSchema)
  .max(CARD_BRANDS.length)
  .refine((brands) => new Set(brands).size === brands.length, "bandeira repetida");

/** Nenhuma marcada = nada exibido no Storefront. */
export const cardBrandsSchema = z.object({
  debit: brandListSchema,
  credit: brandListSchema,
});
export type CardBrands = z.infer<typeof cardBrandsSchema>;

// ---- Tempo estimado (informativo, sem SLA).

/** Teto do tempo estimado em minutos (igual ao CHECK do D1). */
export const MAX_ETA_MINUTES = 240;

export const etaRangeSchema = z
  .object({
    minMinutes: z.number().int().min(1).max(MAX_ETA_MINUTES),
    maxMinutes: z.number().int().min(1).max(MAX_ETA_MINUTES),
  })
  .refine((eta) => eta.minMinutes <= eta.maxMinutes, {
    message: "o mínimo não pode passar do máximo",
    path: ["minMinutes"],
  });
export type EtaRange = z.infer<typeof etaRangeSchema>;

/** "30–45 min" (ou "30 min" quando mín = máx). */
export function formatEtaPt(eta: EtaRange): string {
  return eta.minMinutes === eta.maxMinutes
    ? `${eta.minMinutes} min`
    : `${eta.minMinutes}–${eta.maxMinutes} min`;
}

// ---- Delivery (decisão 42): um modo por Loja; `off` = Delivery desligado.

export const DELIVERY_MODES = ["neighborhood", "fixed"] as const;
export const deliveryModeSchema = z.enum(DELIVERY_MODES);
export type DeliveryMode = z.infer<typeof deliveryModeSchema>;

export const NEIGHBORHOOD_NAME_MAX = 120;
export const MAX_DELIVERY_NEIGHBORHOODS = 200;

export const neighborhoodNameSchema = z.string().trim().min(1).max(NEIGHBORHOOD_NAME_MAX);

/** Bairro atendido. `active: false` = fica salvo, mas não aparece nem é aceito (P-CFG-5). */
export const deliveryNeighborhoodSchema = z.object({
  id: z.string().uuid(),
  name: neighborhoodNameSchema,
  feeCents: centsSchema,
  active: z.boolean(),
});
export type DeliveryNeighborhood = z.infer<typeof deliveryNeighborhoodSchema>;

/** Na escrita: sem `id` cria, com `id` atualiza, ausente da lista apaga. */
export const deliveryNeighborhoodInputSchema = deliveryNeighborhoodSchema.extend({
  id: z.string().uuid().optional(),
});

/**
 * Seção "Entrega" do Painel (CFG-03): Retirada, modo do Delivery e seus valores, pedido mínimo e
 * tempos. A lista de bairros e a Taxa fixa ficam guardadas mesmo no outro modo (o aviso ao trocar
 * diz o que deixa de valer); só o modo ativo vale no checkout.
 */
export const storeSetFulfillmentInputSchema = z
  .object({
    pickupEnabled: z.boolean(),
    deliveryMode: deliveryModeSchema.nullable(),
    fixedFeeCents: centsSchema.nullable(),
    neighborhoods: z.array(deliveryNeighborhoodInputSchema).max(MAX_DELIVERY_NEIGHBORHOODS),
    /** Pedido mínimo só do Delivery, sobre o subtotal dos itens; null = sem mínimo. */
    deliveryMinimumOrderCents: centsSchema.min(1).nullable(),
    deliveryEta: etaRangeSchema.nullable(),
    pickupEta: etaRangeSchema.nullable(),
  })
  .superRefine((input, ctx) => {
    if (input.deliveryMode === "fixed" && input.fixedFeeCents === null) {
      ctx.addIssue({ code: "custom", message: "informe a Taxa fixa", path: ["fixedFeeCents"] });
    }
    if (input.deliveryMode === "neighborhood" && !input.neighborhoods.some((n) => n.active)) {
      ctx.addIssue({
        code: "custom",
        message: "ative pelo menos um bairro",
        path: ["neighborhoods"],
      });
    }
    const keys = input.neighborhoods.map((n) => normalizeNeighborhoodKey(n.name));
    const duplicate = keys.findIndex((key, index) => keys.indexOf(key) !== index);
    if (duplicate !== -1) {
      ctx.addIssue({
        code: "custom",
        message: "bairro repetido",
        path: ["neighborhoods", duplicate, "name"],
      });
    }
    const ids = input.neighborhoods.flatMap((n) => (n.id ? [n.id] : []));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "bairro repetido", path: ["neighborhoods"] });
    }
  });
export type StoreSetFulfillmentInput = z.infer<typeof storeSetFulfillmentInputSchema>;

export const storeSetHoursInputSchema = z.object({ periods: openingHoursSchema });
export type StoreSetHoursInput = z.infer<typeof storeSetHoursInputSchema>;

export const storeSetCardBrandsInputSchema = cardBrandsSchema;
export type StoreSetCardBrandsInput = z.infer<typeof storeSetCardBrandsInputSchema>;

export const storeSetPrintOnAcceptInputSchema = z.object({ printOnAccept: z.boolean() });
export type StoreSetPrintOnAcceptInput = z.infer<typeof storeSetPrintOnAcceptInputSchema>;

/** Dono e Operador ligam e desligam a Pausa (P-OPE-4); toda mudança é auditada. */
export const storeSetPauseInputSchema = z.object({ paused: z.boolean() });
export type StoreSetPauseInput = z.infer<typeof storeSetPauseInputSchema>;

// ---- Visões (Painel).

export const PAUSE_ROLES = ["owner", "operator"] as const;

/**
 * Estado da Pausa com quem ativou (aviso ao Dono: "Pausa ativada por Nome às HH:MM"). `pausedBy`
 * só existe com a Pausa ligada; o histórico de ativação/retomada fica na auditoria da Loja.
 */
export const pauseStateSchema = z.discriminatedUnion("paused", [
  z.object({ paused: z.literal(false) }),
  z.object({
    paused: z.literal(true),
    pausedAt: z.iso.datetime(),
    pausedBy: z.object({
      userId: z.string(),
      name: z.string(),
      role: z.enum(PAUSE_ROLES),
    }),
  }),
]);
export type PauseState = z.infer<typeof pauseStateSchema>;

/** Configuração operacional completa da Loja ativa (Painel: Dono edita; Operador só lê). */
export type StoreOperationSettings = {
  pause: PauseState;
  hours: OpeningPeriod[];
  pickupEnabled: boolean;
  deliveryMode: DeliveryMode | null;
  fixedFeeCents: number | null;
  neighborhoods: DeliveryNeighborhood[];
  deliveryMinimumOrderCents: number | null;
  deliveryEta: EtaRange | null;
  pickupEta: EtaRange | null;
  cardBrands: CardBrands;
  printOnAccept: boolean;
};

/** Ações de auditoria da configuração operacional (tabela `audit_events`). */
export const STORE_OPERATION_AUDIT_ACTIONS = {
  pause: "store.pause",
  resume: "store.resume",
  hours: "store.hours.update",
  fulfillment: "store.fulfillment.update",
  cardBrands: "store.card_brands.update",
  printOnAccept: "store.print_on_accept.update",
} as const;

// ---- Regras puras do checkout sobre a configuração.

/** Quanto falta para o pedido mínimo do Delivery (sobre o subtotal dos itens, sem a taxa). */
export function minimumOrderGap(
  subtotalCents: number,
  minimumOrderCents: number | null,
): { minimumCents: number; missingCents: number } | null {
  if (minimumOrderCents === null) return null;
  return {
    minimumCents: minimumOrderCents,
    missingCents: Math.max(0, minimumOrderCents - subtotalCents),
  };
}

/** Troco para: opcional; quando informado precisa ser ≥ total (P-4.2). */
export function isValidChangeFor(totalCents: number, changeForCents: number | null): boolean {
  return changeForCents === null || changeForCents >= totalCents;
}
