import {
  buildPixLedgerObligation,
  canAdvanceChargeStatus,
  canAdvancePaymentStatus,
  parseWooviWebhookPayload,
  type NormalizedWooviEvent,
} from "@foode/shared";

import type { Prisma } from "./generated/prisma/client.js";
import type { ChargeStatus } from "./generated/prisma/enums.js";

export type PublicPixChargeView = {
  brCode: string;
  correlationId: string;
  expiresAt: string | null;
  qrCodeImage: string;
  status: "active" | "completed" | "expired" | "pending" | "provider_error";
};

export type WooviChargeCreateResult = {
  brCode: string;
  expiresAt?: string | null;
  providerChargeId?: string | null;
  qrCodeImage: string;
};

export type WooviPaymentAdapter = {
  createCharge(input: {
    correlationId: string;
    valueCents: number;
  }): Promise<WooviChargeCreateResult>;
};

export type ActivatePixChargeResult =
  | { kind: "ready"; charge: PublicPixChargeView }
  | { kind: "not_found" }
  | { kind: "not_pix" }
  | { kind: "provider_error"; retryable: true };

export type ApplyWooviWebhookResult =
  | { kind: "ignored" }
  | { kind: "duplicate" }
  | { kind: "applied"; ledgerCreated: boolean }
  | { kind: "charge_not_found" }
  | { kind: "incompatible_payload" };

export type MarkLedgerPaidResult =
  | { kind: "paid"; paidAt: string }
  | { kind: "already_paid"; paidAt: string }
  | { kind: "not_found" };

type PendingChargeRow = {
  amountCents: number;
  brCode: string | null;
  correlationId: string;
  expiresAt: Date | null;
  id: string;
  orderId: string;
  qrCodeImage: string | null;
  status: ChargeStatus;
  storeId: string;
  totalCents: number;
};

function toPublicCharge(charge: {
  brCode: string | null;
  correlationId: string;
  expiresAt: Date | null;
  qrCodeImage: string | null;
  status: ChargeStatus;
}): PublicPixChargeView | null {
  if (!charge.brCode || !charge.qrCodeImage) return null;
  return {
    brCode: charge.brCode,
    correlationId: charge.correlationId,
    expiresAt: charge.expiresAt?.toISOString() ?? null,
    qrCodeImage: charge.qrCodeImage,
    status: charge.status,
  };
}

function mapWooviStatus(status: NormalizedWooviEvent["status"]): ChargeStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "COMPLETED":
      return "completed";
    case "EXPIRED":
      return "expired";
    default:
      return "pending";
  }
}

function localStatusForMonotonic(
  status: ChargeStatus,
): NormalizedWooviEvent["status"] | "PENDING" | "PROVIDER_ERROR" {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "completed":
      return "COMPLETED";
    case "expired":
      return "EXPIRED";
    case "provider_error":
      return "PROVIDER_ERROR";
    default:
      return "PENDING";
  }
}

function sanitizedWebhookPayload(raw: unknown): Prisma.InputJsonValue {
  if (raw === null || typeof raw !== "object") return {};
  const copy = { ...(raw as Record<string, unknown>) };
  delete copy.appId;
  delete copy.authorization;
  delete copy.secret;
  return copy as Prisma.InputJsonValue;
}

export async function loadPixChargeContext(
  transaction: Prisma.TransactionClient,
  input: { orderId: string; storeId: string },
): Promise<PendingChargeRow | null> {
  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${input.storeId}, true)
  `;

  const order = await transaction.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
    select: {
      id: true,
      paymentMethod: true,
      storeId: true,
      totalCents: true,
    },
  });
  if (!order || order.paymentMethod !== "pix") return null;

  const charge = await transaction.paymentCharge.findFirst({
    where: { orderId: order.id },
  });
  if (!charge) return null;
  return {
    amountCents: charge.amountCents,
    brCode: charge.brCode,
    correlationId: charge.correlationId,
    expiresAt: charge.expiresAt,
    id: charge.id,
    orderId: charge.orderId,
    qrCodeImage: charge.qrCodeImage,
    status: charge.status,
    storeId: charge.storeId,
    totalCents: order.totalCents,
  };
}

export async function persistWooviChargeSuccess(
  transaction: Prisma.TransactionClient,
  input: {
    chargeId: string;
    result: WooviChargeCreateResult;
    storeId: string;
  },
): Promise<PublicPixChargeView | null> {
  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${input.storeId}, true)
  `;
  const updated = await transaction.paymentCharge.update({
    where: { id: input.chargeId },
    data: {
      brCode: input.result.brCode,
      expiresAt: input.result.expiresAt
        ? new Date(input.result.expiresAt)
        : null,
      providerChargeId: input.result.providerChargeId ?? null,
      qrCodeImage: input.result.qrCodeImage,
      status: "active",
      updatedAt: new Date(),
    },
    select: {
      brCode: true,
      correlationId: true,
      expiresAt: true,
      qrCodeImage: true,
      status: true,
    },
  });
  return toPublicCharge(updated);
}

export async function persistWooviChargeFailure(
  transaction: Prisma.TransactionClient,
  input: { chargeId: string; storeId: string },
): Promise<void> {
  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${input.storeId}, true)
  `;
  await transaction.paymentCharge.update({
    where: { id: input.chargeId },
    data: { status: "provider_error", updatedAt: new Date() },
  });
}

/**
 * Ativa cobrança Woovi fora de long-TX: lê → adapter → persiste.
 */
export async function activatePixChargeForOrder(
  run: <T>(
    op: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>,
  input: {
    adapter: WooviPaymentAdapter;
    orderId: string;
    storeId: string;
  },
): Promise<ActivatePixChargeResult> {
  const context = await run((tx) =>
    loadPixChargeContext(tx, {
      orderId: input.orderId,
      storeId: input.storeId,
    }),
  );
  if (!context) {
    return { kind: "not_found" };
  }

  const ready = toPublicCharge(context);
  if (
    ready &&
    (context.status === "active" || context.status === "completed")
  ) {
    return { kind: "ready", charge: ready };
  }

  try {
    const created = await input.adapter.createCharge({
      correlationId: context.correlationId,
      valueCents: context.totalCents,
    });
    const view = await run((tx) =>
      persistWooviChargeSuccess(tx, {
        chargeId: context.id,
        result: created,
        storeId: context.storeId,
      }),
    );
    if (!view) return { kind: "provider_error", retryable: true };
    return { kind: "ready", charge: view };
  } catch {
    await run((tx) =>
      persistWooviChargeFailure(tx, {
        chargeId: context.id,
        storeId: context.storeId,
      }),
    );
    return { kind: "provider_error", retryable: true };
  }
}

export async function applyWooviWebhookEvent(
  transaction: Prisma.TransactionClient,
  input: {
    confirmedAtIso: string;
    payload: unknown;
    providerEventIdOverride?: string;
  },
): Promise<ApplyWooviWebhookResult> {
  const parsed = parseWooviWebhookPayload(input.payload);
  if (!parsed.ok) return { kind: "incompatible_payload" };
  const event = parsed.event;
  const providerEventId = input.providerEventIdOverride ?? event.providerEventId;

  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.webhook_correlation_id', ${event.correlationId}, true)
  `;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', '', true)
  `;

  const charge = await transaction.paymentCharge.findFirst({
    where: { correlationId: event.correlationId },
    select: {
      id: true,
      amountCents: true,
      orderId: true,
      status: true,
      storeId: true,
    },
  });
  if (!charge) return { kind: "charge_not_found" };

  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${charge.storeId}, true)
  `;
  await transaction.$executeRaw`
    SELECT set_config('app.webhook_correlation_id', '', true)
  `;

  const already = await transaction.paymentEvent.findFirst({
    where: { provider: "woovi", providerEventId },
    select: { id: true },
  });
  if (already) return { kind: "duplicate" };

  await transaction.paymentEvent.create({
    data: {
      chargeId: charge.id,
      createdAt: new Date(),
      eventType: event.eventType,
      payload: sanitizedWebhookPayload(input.payload),
      processedAt: new Date(),
      provider: "woovi",
      providerEventId,
      storeId: charge.storeId,
    },
  });

  if (event.eventType === "OPENPIX:CHARGE_CREATED") {
    return { kind: "ignored" };
  }

  if (!canAdvanceChargeStatus(localStatusForMonotonic(charge.status), event.status)) {
    return { kind: "ignored" };
  }

  const nextStatus = mapWooviStatus(event.status);
  await transaction.paymentCharge.update({
    where: { id: charge.id },
    data: { status: nextStatus, updatedAt: new Date() },
  });

  let ledgerCreated = false;
  if (
    event.eventType === "OPENPIX:CHARGE_COMPLETED" &&
    event.status === "COMPLETED"
  ) {
    const order = await transaction.order.findFirst({
      where: { id: charge.orderId },
      select: { paymentStatus: true },
    });
    if (order && canAdvancePaymentStatus(order.paymentStatus, "paid")) {
      await transaction.order.update({
        where: { id: charge.orderId },
        data: { paymentStatus: "paid", updatedAt: new Date() },
      });
    }

    const existingLedger = await transaction.ledgerEntry.findFirst({
      where: { orderId: charge.orderId },
      select: { id: true },
    });
    if (!existingLedger) {
      const obligation = buildPixLedgerObligation({
        confirmedAtIso: input.confirmedAtIso,
        grossCents: charge.amountCents,
      });
      await transaction.ledgerEntry.create({
        data: {
          chargeId: charge.id,
          createdAt: new Date(),
          expectedPayoutAt: new Date(
            `${obligation.expectedPayoutDate}T12:00:00.000Z`,
          ),
          feeBps: obligation.feeBps,
          feeCents: obligation.feeCents,
          grossCents: obligation.grossCents,
          netCents: obligation.netCents,
          orderId: charge.orderId,
          paidAt: null,
          provider: "woovi",
          storeId: charge.storeId,
          updatedAt: new Date(),
        },
      });
      ledgerCreated = true;
    }
  }

  return { kind: "applied", ledgerCreated };
}

export async function markLedgerEntryPaid(
  transaction: Prisma.TransactionClient,
  input: { ledgerEntryId: string; paidAtIso: string },
): Promise<MarkLedgerPaidResult> {
  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.ops_ledger_entry_id', ${input.ledgerEntryId}, true)
  `;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', '', true)
  `;

  const entry = await transaction.ledgerEntry.findFirst({
    where: { id: input.ledgerEntryId },
    select: { id: true, paidAt: true, storeId: true },
  });
  if (!entry) return { kind: "not_found" };

  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${entry.storeId}, true)
  `;
  await transaction.$executeRaw`
    SELECT set_config('app.ops_ledger_entry_id', '', true)
  `;

  if (entry.paidAt) {
    return { kind: "already_paid", paidAt: entry.paidAt.toISOString() };
  }

  const paidAt = new Date(input.paidAtIso);
  const updated = await transaction.ledgerEntry.update({
    where: { id: entry.id },
    data: { paidAt, updatedAt: new Date() },
    select: { paidAt: true },
  });
  return { kind: "paid", paidAt: updated.paidAt!.toISOString() };
}

export async function findPublicPixChargeForOrder(
  transaction: Prisma.TransactionClient,
  input: { orderId: string; storeId: string },
): Promise<PublicPixChargeView | null> {
  const context = await loadPixChargeContext(transaction, input);
  return context ? toPublicCharge(context) : null;
}
