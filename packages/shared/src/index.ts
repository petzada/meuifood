import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const membershipRoleSchema = z.enum(["owner", "operator"]);

export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export {
  assertSingleStoreCart,
  cartContractSchema,
  cartLineContractSchema,
  createEmptyCart,
  previewCartTotalCents,
  previewLineTotalCents,
  validateCartLineChoices,
  type CartContract,
  type CartLineContract,
  type CatalogAdditional,
  type CatalogComplementGroup,
  type CatalogComplementOption,
  type CatalogItemForCart,
  type LineValidationError,
  type LineValidationResult,
} from "./cart-preview.js";

export {
  buildWhatsAppMeUrl,
  normalizeBrazilianMobilePhone,
  type PhoneNormalizationResult,
} from "./phone-br.js";

export {
  allowedPickupTransitions,
  canTransitionPickup,
  fulfillmentTypeSchema,
  orderStatusLabelPt,
  orderStatusSchema,
  paymentMethodSchema,
  type FulfillmentType,
  type OrderStatus,
  type PaymentMethod,
} from "./order-status.js";

export {
  ORDER_POLL_INTERVAL_MS,
  createEmptyPollSoundState,
  stepOrderPollSound,
  type PollSoundState,
  type PollSoundStep,
} from "./order-poll-sound.js";

export {
  recalculateGuestPickupOrder,
  type AdditionalSnapshot,
  type CatalogItemForOrder,
  type ComplementSnapshot,
  type OrderRecalculationError,
  type OrderRecalculationResult,
  type RecalculatedOrderLine,
} from "./order-recalculate.js";
