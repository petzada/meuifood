import { randomBytes } from "node:crypto";

import {
  recalculateGuestPickupOrder,
  type CartLineContract,
} from "@foode/shared";

import type { Prisma } from "./generated/prisma/client.js";
import type {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
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

export type OrderDetailView = {
  accessToken: string;
  createdAt: string;
  deliveryFeeCents: number;
  fulfillmentType: FulfillmentType;
  guestName: string;
  guestPhoneE164: string;
  id: string;
  itemsTotalCents: number;
  lines: OrderLineView[];
  paymentMethod: PaymentMethod;
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
  publicCode: string;
  status: OrderStatus;
  totalCents: number;
};

export type CreateGuestPickupOrderInput = {
  guestName: string;
  guestPhoneE164: string;
  idempotencyKey: string;
  lines: CartLineContract[];
  payloadHash: string;
  storeSlug: string;
};

export type CreateGuestPickupOrderResult =
  | { kind: "created"; order: OrderDetailView }
  | { kind: "replay"; order: OrderDetailView }
  | { kind: "conflict" }
  | { kind: "store_not_found" }
  | { kind: "pickup_disabled" }
  | { kind: "recalculation_failed"; error: string };

function newAccessToken() {
  return randomBytes(32).toString("base64url");
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
  accessToken: true,
  createdAt: true,
  deliveryFeeCents: true,
  fulfillmentType: true,
  guestName: true,
  guestPhoneE164: true,
  id: true,
  itemsTotalCents: true,
  paymentMethod: true,
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

function mapOrderDetail(order: {
  accessToken: string;
  createdAt: Date;
  deliveryFeeCents: number;
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
  publicCode: string;
  status: OrderStatus;
  storeId: string;
  totalCents: number;
  updatedAt: Date;
}): OrderDetailView {
  return {
    accessToken: order.accessToken,
    createdAt: order.createdAt.toISOString(),
    deliveryFeeCents: order.deliveryFeeCents,
    fulfillmentType: order.fulfillmentType,
    guestName: order.guestName,
    guestPhoneE164: order.guestPhoneE164,
    id: order.id,
    itemsTotalCents: order.itemsTotalCents,
    lines: order.lines.map(mapOrderLine),
    paymentMethod: order.paymentMethod,
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

export async function createGuestPickupOrderRecord(
  transaction: Prisma.TransactionClient,
  input: CreateGuestPickupOrderInput,
): Promise<CreateGuestPickupOrderResult> {
  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.public_slug', ${input.storeSlug}, true)
  `;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', '', true)
  `;

  const store = await transaction.store.findFirst({
    where: { slug: input.storeSlug },
    select: { id: true, pickupEnabled: true },
  });
  if (!store) return { kind: "store_not_found" };
  if (!store.pickupEnabled) return { kind: "pickup_disabled" };

  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', ${store.id}, true)
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

  const deliveryFeeCents = 0;
  const totalCents = recalculated.itemsTotalCents + deliveryFeeCents;
  const now = new Date();

  try {
    const created = await transaction.order.create({
      data: {
        accessToken: newAccessToken(),
        createdAt: now,
        deliveryFeeCents,
        fulfillmentType: "pickup",
        guestName: input.guestName,
        guestPhoneE164: input.guestPhoneE164,
        idempotencyKey: input.idempotencyKey,
        idempotencyPayloadHash: input.payloadHash,
        itemsTotalCents: recalculated.itemsTotalCents,
        paymentMethod: "on_delivery",
        publicCode: newPublicCode(),
        status: "received",
        storeId: store.id,
        totalCents,
        updatedAt: now,
      },
      select: { id: true },
    });

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
    return { kind: "created", order: detail };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code !== "P2002") throw error;

    const raced = await transaction.order.findFirst({
      where: {
        storeId: store.id,
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true, idempotencyPayloadHash: true },
    });
    if (!raced) throw error;
    if (raced.idempotencyPayloadHash !== input.payloadHash) {
      return { kind: "conflict" };
    }
    const replay = await loadOrderDetail(transaction, raced.id);
    if (!replay) throw error;
    return { kind: "replay", order: replay };
  }
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
  await transaction.$executeRaw`SET LOCAL ROLE foode_business`;
  await transaction.$executeRaw`
    SELECT set_config('app.public_order_access_token', ${accessToken}, true)
  `;
  await transaction.$executeRaw`
    SELECT set_config('app.current_store_id', '', true)
  `;

  const order = await transaction.order.findFirst({
    where: { accessToken },
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
  toStatus: OrderStatus,
): Promise<OrderDetailView | null> {
  const updated = await transaction.order.updateMany({
    where: { id: orderId, storeId },
    data: { status: toStatus },
  });
  if (updated.count === 0) return null;
  return await findStoreOrderDetail(transaction, storeId, orderId);
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
