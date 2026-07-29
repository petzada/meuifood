import { z } from "zod";

const chargeStatusSchema = z.enum(["ACTIVE", "COMPLETED", "EXPIRED"]);

const chargeSchema = z
  .object({
    brCode: z.string().optional(),
    correlationID: z.string().min(1),
    globalID: z.string().optional(),
    qrCodeImage: z.string().optional(),
    status: chargeStatusSchema.optional(),
    transactionID: z.string().optional(),
    value: z.number().int().nonnegative(),
  })
  .passthrough();

export const wooviWebhookPayloadSchema = z.discriminatedUnion("event", [
  z
    .object({
      charge: chargeSchema,
      event: z.literal("OPENPIX:CHARGE_CREATED"),
      pix: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      charge: chargeSchema,
      event: z.literal("OPENPIX:CHARGE_COMPLETED"),
      pix: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      charge: chargeSchema,
      event: z.literal("OPENPIX:CHARGE_EXPIRED"),
      pix: z.unknown().optional(),
    })
    .passthrough(),
]);

export type WooviWebhookPayload = z.infer<typeof wooviWebhookPayloadSchema>;

export type NormalizedWooviEvent = {
  correlationId: string;
  eventType: WooviWebhookPayload["event"];
  /** Identidade estável para idempotência: event + correlation + status + transaction. */
  providerEventId: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "UNKNOWN";
  transactionId: string | null;
  valueCents: number;
};

const chargeRank: Record<NormalizedWooviEvent["status"], number> = {
  UNKNOWN: 0,
  ACTIVE: 1,
  EXPIRED: 2,
  COMPLETED: 3,
};

export function parseWooviWebhookPayload(
  body: unknown,
):
  | { ok: true; event: NormalizedWooviEvent; raw: WooviWebhookPayload }
  | { ok: false; error: "incompatible_payload" } {
  const parsed = wooviWebhookPayloadSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "incompatible_payload" };
  const status = parsed.data.charge.status ?? "UNKNOWN";
  const transactionId = parsed.data.charge.transactionID ?? null;
  const providerEventId = [
    parsed.data.event,
    parsed.data.charge.correlationID,
    status,
    transactionId ?? "none",
  ].join(":");
  return {
    ok: true,
    event: {
      correlationId: parsed.data.charge.correlationID,
      eventType: parsed.data.event,
      providerEventId,
      status,
      transactionId,
      valueCents: parsed.data.charge.value,
    },
    raw: parsed.data,
  };
}

/** Máquina monotônica de status de cobrança — COMPLETED nunca regride. */
export function canAdvanceChargeStatus(
  from: NormalizedWooviEvent["status"] | "PENDING" | "PROVIDER_ERROR",
  to: NormalizedWooviEvent["status"],
): boolean {
  const fromRank =
    from === "PENDING" || from === "PROVIDER_ERROR"
      ? 0
      : chargeRank[from];
  return chargeRank[to] >= fromRank;
}
