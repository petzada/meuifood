import { createHash, randomBytes } from "node:crypto";

import {
  recalculateGuestPickupOrder,
  resolveDeliveryFeeCents,
  sanitizeDeliveryAddress,
  type CartLineContract,
  type DeliveryFeeMode,
} from "@foode/shared";

import { checkoutBlockReason } from "./checkout-gate.js";
import type { Prisma } from "./generated/prisma/client.js";
import type {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "./generated/prisma/enums.js";

export type ComplementSnapshotRecord = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
};

export type AdditionalSnapshotRecord = {
  id: string;
  name: string;
  priceCents: number;
};

export type OrderLineView = {
  additionalSnapshots: AdditionalSnapshotRecord[];
  complementSnapshots: ComplementSnapshotRecord[];
  id: string;
  itemName: string;
  lineTotalCents: number;
  menuItemId: string | null;
  quantity: number;
  sortOrder: number;
  unitPriceCents: number;
};

export type OrderDeliveryAddressView = {
  complement: string | null;
  neighborhood: string;
  reference: string | null;
  streetLine: string;
};

export type OrderDetailView = {
  createdAt: string;
  deliveryAddress: OrderDeliveryAddressView | null;
  deliveryFeeCents: number;
  deliveryFeeModeSnapshot: DeliveryFeeMode | null;
  fulfillmentType: FulfillmentType;
  guestName: string;
  guestPhoneE164: string;
  id: string;
  itemsTotalCents: number;
  lines: OrderLineView[];
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  publicCode: string;
  status: OrderStatus;
  storeId: string;
  totalCents: number;
  updatedAt: string;
};

export type OrderListItemView = {
  createdAt: string;
  fulfillmentType: FulfillmentType;
  guestName: string;
  id: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  publicCode: string;
  status: OrderStatus;
  totalCents: number;
};

export type CreateGuestOrderInput = {
  address?: {
    complement?: string | null;
    neighborhood: string;
    reference?: string | null;
    streetLine: string;
  } | null;
  fulfillmentType: FulfillmentType;
  guestName: string;
  guestPhoneE164: string;
  idempotencyKey: string;
  lines: CartLineContract[];
  /** Instant Temporal/ISO da requisição — revalidado dentro da transação. */
  nowIso: string;
  payloadHash: string;
  paymentMethod: PaymentMethod;
  storeSlug: string;
};

/** @deprecated use CreateGuestOrderInput */
export type CreateGuestPickupOrderInput = Omit<
  CreateGuestOrderInput,
  "address" | "fulfillmentType" | "paymentMethod"
> & {
  fulfillmentType?: "pickup";
  paymentMethod?: PaymentMethod;
};

export type CreateGuestOrderResult =
  | { kind: "created"; accessToken: string; order: OrderDetailView }
  | { kind: "replay"; order: OrderDetailView }
  | { kind: "conflict" }
  | { kind: "store_not_found" }
  | { kind: "pickup_disabled" }
  | { kind: "delivery_not_configured" }
  | { kind: "neighborhood_not_served" }
  | { kind: "invalid_address" }
  | { kind: "store_paused" }
  | { kind: "store_outside_hours" }
  | { kind: "billing_mode_not_allowed" }
  | { kind: "recalculation_failed"; error: string };

export type CreateGuestPickupOrderResult = CreateGuestOrderResult;

export type TransitionOrderResult =
  | { kind: "updated"; order: OrderDetailView }
  | { kind: "not_found" }
  | { kind: "conflict" };

/**
 * Capability token: 256 bits opacos (base64url).
 * Persistência: somente SHA-256 hex em `orders.access_token` (lookup por hash).
 * O token bruto nunca é armazenado.
 */
export function mintOrderAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOrderAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function newPublicCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

function asSnapshotArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function mapOrderLine(line: {
  additionalSnapshots: Prisma.JsonValue;
  complementSnapshots: Prisma.JsonValue;
  id: string;
  itemName: string;
  lineTotalCents: number;
  menuItemId: string | null;
  quantity: number;
  sortOrder: number;
  unitPriceCents: number;
}): OrderLineView {
  return {
    additionalSnapshots: asSnapshotArray<AdditionalSnapshotRecord>(
      line.additionalSnapshots,
    ),
    complementSnapshots: asSnapshotArray<ComplementSnapshotRecord>(
      line.complementSnapshots,
    ),
    id: line.id,
    itemName: line.itemName,
    lineTotalCents: line.lineTotalCents,
    menuItemId: line.menuItemId,
    quantity: line.quantity,
    sortOrder: line.sortOrder,
    unitPriceCents: line.unitPriceCents,
  };
}

const orderLineSelect = {
  additionalSnapshots: true,
  complementSnapshots: true,
  id: true,
  itemName: true,
  lineTotalCents: true,
  menuItemId: true,
  quantity: true,
  sortOrder: true,
  unitPriceCents: true,
} satisfies Prisma.OrderLineSelect;

const orderDetailSelect = {
  createdAt: true,
  deliveryComplement: true,
  deliveryFeeCents: true,
  deliveryFeeModeSnapshot: true,
  deliveryNeighborhood: true,
  deliveryReference: true,
  deliveryStreetLine: true,
  fulfillmentType: true,
  guestName: true,
  guestPhoneE164: true,
  id: true,
  itemsTotalCents: true,
  paymentMethod: true,
  paymentStatus: true,
  publicCode: true,
  status: true,
  storeId: true,
  totalCents: true,
  updatedAt: true,
  lines: {
    orderBy: [{ sortOrder: "asc" as const }],
    select: orderLineSelect,
  },
} satisfies Prisma.OrderSelect;

function mapDeliveryAddress(order: {
  deliveryComplement: string | null;
  deliveryNeighborhood: string | null;
  deliveryReference: string | null;
  deliveryStreetLine: string | null;
  fulfillmentType: FulfillmentType;
}): OrderDeliveryAddressView | null {
  if (
    order.fulfillmentType !== "delivery" ||
    !order.deliveryStreetLine ||
    !order.deliveryNeighborhood
  ) {
    return null;
  }
  return {
    complement: order.deliveryComplement,
    neighborhood: order.deliveryNeighborhood,
    reference: order.deliveryReference,
    streetLine: order.deliveryStreetLine,
  };
}

function mapOrderDetail(order: {
  createdAt: Date;
  deliveryComplement: string | null;
  deliveryFeeCents: number;
  deliveryFeeModeSnapshot: DeliveryFeeMode | null;
  deliveryNeighborhood: string | null;
  deliveryReference: string | null;
  deliveryStreetLine: string | null;
  fulfillmentType: FulfillmentType;
  guestName: string;
  guestPhoneE164: string;
  id: string;
  itemsTotalCents: number;
  lines: Array<{
    additionalSnapshots: Prisma.JsonValue;
    complementSnapshots: Prisma.JsonValue;
    id: string;
    itemName: string;
    lineTotalCents: number;
    menuItemId: string | null;
    quantity: number;
    sortOrder: number;
    unitPriceCents: number;
  }>;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  publicCode: string;
  status: OrderStatus;
  storeId: string;
  totalCents: number;
  updatedAt: Date;
}): OrderDetailView {
  return {
    createdAt: order.createdAt.toISOString(),
    deliveryAddress: mapDeliveryAddress(order),
    deliveryFeeCents: order.deliveryFeeCents,
    deliveryFeeModeSnapshot: order.deliveryFeeModeSnapshot,
    fulfillmentType: order.fulfillmentType,
    guestName: order.guestName,
    guestPhoneE164: order.guestPhoneE164,
    id: order.id,
    itemsTotalCents: order.itemsTotalCents,
    lines: order.lines.map(mapOrderLine),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    publicCode: order.publicCode,
    status: order.status,
    storeId: order.storeId,
    totalCents: order.totalCents,
    updatedAt: order.updatedAt.toISOString(),
  };
}

async function loadOrderDetail(
  transaction: Prisma.TransactionClient,
  orderId: string,
): Promise<OrderDetailView | null> {
  const order = await transaction.order.findFirst({
    where: { id: orderId },
    select: orderDetailSelect,
  });
  return order ? mapOrderDetail(order) : null;
}

export async function createGuestOrderRecord(
  transaction: Prisma.TransactionClient,
  input: CreateGuestOrderInput,
): Promise<CreateGuestOrderResult> {
  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.public_slug', ${input.storeSlug}, true)
  `;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', '', true)
  `;

  const storeRef = await transaction.store.findFirst({
    where: { slug: input.storeSlug },
    select: { id: true },
  });
  if (!storeRef) return { kind: "store_not_found" };

  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${storeRef.id}, true)
  `;

  const lockedStores = await transaction.$queryRaw<
    Array<{
      billingMode: "pilot_platform" | "baas" | "merchant_own_account";
      deliveryFeeMode: DeliveryFeeMode | null;
      fixedDeliveryFeeCents: number | null;
      id: string;
      paused: boolean;
      pickupEnabled: boolean;
    }>
  >`
    SELECT
      id,
      paused,
      pickup_enabled AS "pickupEnabled",
      delivery_fee_mode AS "deliveryFeeMode",
      fixed_delivery_fee_cents AS "fixedDeliveryFeeCents",
      billing_mode AS "billingMode"
    FROM stores
    WHERE id = ${storeRef.id}::uuid
    FOR UPDATE
  `;
  const store = lockedStores[0];
  if (!store) return { kind: "store_not_found" };

  if (input.paymentMethod === "pix" && store.billingMode !== "pilot_platform") {
    return { kind: "billing_mode_not_allowed" };
  }

  if (input.fulfillmentType === "pickup" && !store.pickupEnabled) {
    return { kind: "pickup_disabled" };
  }
  if (input.fulfillmentType === "delivery" && store.deliveryFeeMode == null) {
    return { kind: "delivery_not_configured" };
  }

  const periods = await transaction.storeOperatingPeriod.findMany({
    orderBy: [{ weekday: "asc" }, { opensAt: "asc" }],
    select: { closesAt: true, opensAt: true, weekday: true },
  });
  const block = checkoutBlockReason({
    nowIso: input.nowIso,
    paused: store.paused,
    periods,
  });
  if (block === "paused") return { kind: "store_paused" };
  if (block === "outside_hours") return { kind: "store_outside_hours" };

  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`foode:order-idem:${store.id}:${input.idempotencyKey}`})
    )
  `;

  const existing = await transaction.order.findFirst({
    where: {
      storeId: store.id,
      idempotencyKey: input.idempotencyKey,
    },
    select: {
      id: true,
      idempotencyPayloadHash: true,
    },
  });
  if (existing) {
    if (existing.idempotencyPayloadHash !== input.payloadHash) {
      return { kind: "conflict" };
    }
    const replay = await loadOrderDetail(transaction, existing.id);
    if (!replay) return { kind: "conflict" };
    return { kind: "replay", order: replay };
  }

  let deliveryFeeCents = 0;
  let deliveryFeeModeSnapshot: DeliveryFeeMode | null = null;
  let deliveryStreetLine: string | null = null;
  let deliveryNeighborhood: string | null = null;
  let deliveryComplement: string | null = null;
  let deliveryReference: string | null = null;

  if (input.fulfillmentType === "delivery") {
    if (!input.address) return { kind: "invalid_address" };
    const neighborhoods =
      store.deliveryFeeMode === "neighborhood"
        ? await transaction.deliveryNeighborhood.findMany({
            where: { storeId: store.id },
            select: {
              feeCents: true,
              name: true,
              normalizedName: true,
            },
          })
        : [];
    const fee = resolveDeliveryFeeCents(
      {
        fixedDeliveryFeeCents: store.fixedDeliveryFeeCents,
        mode: store.deliveryFeeMode,
        neighborhoods,
      },
      input.address,
    );
    if (!fee.ok) {
      return { kind: fee.error };
    }
    const sanitized = sanitizeDeliveryAddress(input.address);
    if (!sanitized.ok) return { kind: "invalid_address" };
    deliveryFeeCents = fee.feeCents;
    deliveryFeeModeSnapshot = fee.mode;
    deliveryStreetLine = sanitized.streetLine;
    deliveryNeighborhood = fee.neighborhoodDisplay;
    deliveryComplement = sanitized.complement;
    deliveryReference = sanitized.reference;
  }

  const itemIds = [...new Set(input.lines.map((line) => line.itemId))];
  const catalogItems = await loadCatalogItemsForOrder(
    transaction,
    store.id,
    itemIds,
  );
  const catalogByItemId = new Map(
    catalogItems.map((item) => [item.id, item] as const),
  );
  const recalculated = recalculateGuestPickupOrder(catalogByItemId, input.lines);
  if (!recalculated.ok) {
    return { kind: "recalculation_failed", error: recalculated.error };
  }

  const totalCents = recalculated.itemsTotalCents + deliveryFeeCents;
  const now = new Date();
  const rawAccessToken = mintOrderAccessToken();
  const accessTokenHash = hashOrderAccessToken(rawAccessToken);
  const paymentStatus: PaymentStatus =
    input.paymentMethod === "pix" ? "awaiting_payment" : "not_required";

  const created = await transaction.order.create({
    data: {
      accessToken: accessTokenHash,
      createdAt: now,
      deliveryComplement,
      deliveryFeeCents,
      deliveryFeeModeSnapshot,
      deliveryNeighborhood,
      deliveryReference,
      deliveryStreetLine,
      fulfillmentType: input.fulfillmentType,
      guestName: input.guestName,
      guestPhoneE164: input.guestPhoneE164,
      idempotencyKey: input.idempotencyKey,
      idempotencyPayloadHash: input.payloadHash,
      itemsTotalCents: recalculated.itemsTotalCents,
      paymentMethod: input.paymentMethod,
      paymentStatus,
      publicCode: newPublicCode(),
      status: "received",
      storeId: store.id,
      totalCents,
      updatedAt: now,
    },
    select: { id: true },
  });

  if (input.paymentMethod === "pix") {
    await transaction.paymentCharge.create({
      data: {
        amountCents: totalCents,
        correlationId: `foode-order-${created.id}`,
        createdAt: now,
        orderId: created.id,
        provider: "woovi",
        status: "pending",
        storeId: store.id,
        updatedAt: now,
      },
    });
  }

  await transaction.orderLine.createMany({
    data: recalculated.lines.map((line, index) => ({
      additionalSnapshots: line.additionalSnapshots,
      complementSnapshots: line.complementSnapshots,
      createdAt: now,
      itemName: line.itemName,
      lineTotalCents: line.lineTotalCents,
      menuItemId: line.menuItemId,
      orderId: created.id,
      quantity: line.quantity,
      sortOrder: index,
      storeId: store.id,
      unitPriceCents: line.unitPriceCents,
      updatedAt: now,
    })),
  });

  const detail = await loadOrderDetail(transaction, created.id);
  if (!detail) {
    throw new Error("order_persist_failed");
  }
  return { kind: "created", accessToken: rawAccessToken, order: detail };
}

/** Compat Ticket 08: Pedido Guest Retirada. */
export async function createGuestPickupOrderRecord(
  transaction: Prisma.TransactionClient,
  input: CreateGuestPickupOrderInput,
): Promise<CreateGuestOrderResult> {
  return createGuestOrderRecord(transaction, {
    ...input,
    address: null,
    fulfillmentType: "pickup",
    paymentMethod: input.paymentMethod ?? "on_delivery",
  });
}

export async function findOrderByAccessToken(
  transaction: Prisma.TransactionClient,
  accessToken: string,
): Promise<OrderDetailView | null> {
  const tracking = await findPublicOrderTracking(transaction, accessToken);
  return tracking?.order ?? null;
}

export type PublicOrderTrackingView = {
  contactPhoneE164: string | null;
  order: OrderDetailView;
  storeName: string;
  storeSlug: string;
};

export async function findPublicOrderTracking(
  transaction: Prisma.TransactionClient,
  accessToken: string,
): Promise<PublicOrderTrackingView | null> {
  const accessTokenHash = hashOrderAccessToken(accessToken);

  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.public_order_access_token', ${accessTokenHash}, true)
  `;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', '', true)
  `;

  const order = await transaction.order.findFirst({
    where: { accessToken: accessTokenHash },
    select: { id: true, storeId: true },
  });
  if (!order) return null;

  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${order.storeId}, true)
  `;
  const detail = await loadOrderDetail(transaction, order.id);
  if (!detail) return null;

  const store = await transaction.store.findFirst({
    where: { id: order.storeId },
    select: {
      contactPhoneE164: true,
      name: true,
      slug: true,
    },
  });
  if (!store) return null;

  return {
    contactPhoneE164: store.contactPhoneE164,
    order: detail,
    storeName: store.name,
    storeSlug: store.slug,
  };
}

export async function listStoreOrders(
  transaction: Prisma.TransactionClient,
  storeId: string,
): Promise<OrderListItemView[]> {
  const orders = await transaction.order.findMany({
    where: { storeId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      createdAt: true,
      fulfillmentType: true,
      guestName: true,
      id: true,
      paymentMethod: true,
      paymentStatus: true,
      publicCode: true,
      status: true,
      totalCents: true,
    },
  });
  return orders.map((order) => ({
    createdAt: order.createdAt.toISOString(),
    fulfillmentType: order.fulfillmentType,
    guestName: order.guestName,
    id: order.id,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    publicCode: order.publicCode,
    status: order.status,
    totalCents: order.totalCents,
  }));
}

export async function findStoreOrderDetail(
  transaction: Prisma.TransactionClient,
  storeId: string,
  orderId: string,
): Promise<OrderDetailView | null> {
  const order = await transaction.order.findFirst({
    where: { id: orderId, storeId },
    select: orderDetailSelect,
  });
  return order ? mapOrderDetail(order) : null;
}

export async function transitionStoreOrder(
  transaction: Prisma.TransactionClient,
  storeId: string,
  orderId: string,
  expectedStatus: OrderStatus,
  toStatus: OrderStatus,
): Promise<TransitionOrderResult> {
  const updated = await transaction.order.updateMany({
    where: { id: orderId, storeId, status: expectedStatus },
    data: { status: toStatus },
  });
  if (updated.count === 1) {
    const order = await findStoreOrderDetail(transaction, storeId, orderId);
    if (!order) return { kind: "not_found" };
    return { kind: "updated", order };
  }

  const current = await findStoreOrderDetail(transaction, storeId, orderId);
  if (!current) return { kind: "not_found" };
  return { kind: "conflict" };
}

export async function loadCatalogItemsForOrder(
  transaction: Prisma.TransactionClient,
  storeId: string,
  itemIds: string[],
): Promise<
  Array<{
    available: boolean;
    additionals: Array<{
      available: boolean;
      id: string;
      name: string;
      priceCents: number;
    }>;
    complementGroups: Array<{
      id: string;
      name: string;
      options: Array<{ id: string; name: string }>;
      required: boolean;
    }>;
    id: string;
    name: string;
    priceCents: number;
  }>
> {
  if (itemIds.length === 0) return [];

  const items = await transaction.menuItem.findMany({
    where: { storeId, id: { in: itemIds } },
    select: {
      available: true,
      id: true,
      name: true,
      priceCents: true,
      complementGroups: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          required: true,
          options: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true, name: true },
          },
        },
      },
      additionals: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          available: true,
          id: true,
          name: true,
          priceCents: true,
        },
      },
    },
  });

  return items;
}
