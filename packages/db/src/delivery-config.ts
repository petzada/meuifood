import {
  normalizeNeighborhoodKey,
  sanitizeNeighborhoodDisplayName,
  type DeliveryFeeMode,
} from "@foode/shared";

import type { Prisma } from "./generated/prisma/client.js";

export type DeliveryNeighborhoodView = {
  feeCents: number;
  id: string;
  name: string;
  normalizedName: string;
  sortOrder: number;
};

export type StoreDeliveryConfigView = {
  fixedDeliveryFeeCents: number | null;
  mode: DeliveryFeeMode | null;
  neighborhoods: DeliveryNeighborhoodView[];
  pickupEnabled: boolean;
};

export type PublicDeliveryConfigView = {
  deliveryAvailable: boolean;
  fixedDeliveryFeeCents: number | null;
  mode: DeliveryFeeMode | null;
  neighborhoods: Array<{ feeCents: number; name: string }>;
  pickupEnabled: boolean;
};

function mapNeighborhood(row: {
  feeCents: number;
  id: string;
  name: string;
  normalizedName: string;
  sortOrder: number;
}): DeliveryNeighborhoodView {
  return {
    feeCents: row.feeCents,
    id: row.id,
    name: row.name,
    normalizedName: row.normalizedName,
    sortOrder: row.sortOrder,
  };
}

export async function getStoreDeliveryConfig(
  transaction: Prisma.TransactionClient,
  storeId: string,
): Promise<StoreDeliveryConfigView> {
  const store = await transaction.store.findFirst({
    where: { id: storeId },
    select: {
      deliveryFeeMode: true,
      fixedDeliveryFeeCents: true,
      pickupEnabled: true,
    },
  });
  if (!store) {
    throw new Error("store_not_found");
  }
  const neighborhoods = await transaction.deliveryNeighborhood.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      feeCents: true,
      id: true,
      name: true,
      normalizedName: true,
      sortOrder: true,
    },
  });
  return {
    fixedDeliveryFeeCents: store.fixedDeliveryFeeCents,
    mode: store.deliveryFeeMode,
    neighborhoods: neighborhoods.map(mapNeighborhood),
    pickupEnabled: store.pickupEnabled,
  };
}

export async function setStorePickupEnabled(
  transaction: Prisma.TransactionClient,
  storeId: string,
  pickupEnabled: boolean,
): Promise<StoreDeliveryConfigView> {
  await transaction.store.update({
    where: { id: storeId },
    data: { pickupEnabled },
  });
  return getStoreDeliveryConfig(transaction, storeId);
}

export async function setStoreDeliveryFeeMode(
  transaction: Prisma.TransactionClient,
  storeId: string,
  input:
    | { mode: "fixed"; fixedDeliveryFeeCents: number }
    | { mode: "neighborhood" }
    | { mode: null },
): Promise<StoreDeliveryConfigView> {
  if (input.mode === "fixed") {
    if (
      !Number.isInteger(input.fixedDeliveryFeeCents) ||
      input.fixedDeliveryFeeCents < 0
    ) {
      throw new Error("invalid_fixed_fee");
    }
    await transaction.store.update({
      where: { id: storeId },
      data: {
        deliveryFeeMode: "fixed",
        fixedDeliveryFeeCents: input.fixedDeliveryFeeCents,
      },
    });
  } else if (input.mode === "neighborhood") {
    await transaction.store.update({
      where: { id: storeId },
      data: { deliveryFeeMode: "neighborhood" },
    });
  } else {
    await transaction.store.update({
      where: { id: storeId },
      data: { deliveryFeeMode: null },
    });
  }
  return getStoreDeliveryConfig(transaction, storeId);
}

export type UpsertNeighborhoodResult =
  | { kind: "created"; neighborhood: DeliveryNeighborhoodView }
  | { kind: "updated"; neighborhood: DeliveryNeighborhoodView }
  | { kind: "duplicate" }
  | { kind: "invalid" };

export async function createDeliveryNeighborhood(
  transaction: Prisma.TransactionClient,
  storeId: string,
  input: { feeCents: number; name: string },
): Promise<UpsertNeighborhoodResult> {
  const name = sanitizeNeighborhoodDisplayName(input.name);
  const normalizedName = normalizeNeighborhoodKey(name);
  if (!name || !normalizedName) return { kind: "invalid" };
  if (!Number.isInteger(input.feeCents) || input.feeCents < 0) {
    return { kind: "invalid" };
  }

  const existing = await transaction.deliveryNeighborhood.findFirst({
    where: { storeId, normalizedName },
    select: { id: true },
  });
  if (existing) return { kind: "duplicate" };

  const maxSort = await transaction.deliveryNeighborhood.aggregate({
    where: { storeId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
  const now = new Date();
  try {
    const created = await transaction.deliveryNeighborhood.create({
      data: {
        createdAt: now,
        feeCents: input.feeCents,
        name,
        normalizedName,
        sortOrder,
        storeId,
        updatedAt: now,
      },
      select: {
        feeCents: true,
        id: true,
        name: true,
        normalizedName: true,
        sortOrder: true,
      },
    });
    return { kind: "created", neighborhood: mapNeighborhood(created) };
  } catch {
    return { kind: "duplicate" };
  }
}

export async function updateDeliveryNeighborhood(
  transaction: Prisma.TransactionClient,
  storeId: string,
  neighborhoodId: string,
  input: { feeCents?: number; name?: string },
): Promise<UpsertNeighborhoodResult> {
  const current = await transaction.deliveryNeighborhood.findFirst({
    where: { id: neighborhoodId, storeId },
    select: {
      feeCents: true,
      id: true,
      name: true,
      normalizedName: true,
      sortOrder: true,
    },
  });
  if (!current) return { kind: "invalid" };

  let name = current.name;
  let normalizedName = current.normalizedName;
  if (input.name !== undefined) {
    name = sanitizeNeighborhoodDisplayName(input.name);
    normalizedName = normalizeNeighborhoodKey(name);
    if (!name || !normalizedName) return { kind: "invalid" };
  }
  const feeCents = input.feeCents ?? current.feeCents;
  if (!Number.isInteger(feeCents) || feeCents < 0) return { kind: "invalid" };

  if (normalizedName !== current.normalizedName) {
    const clash = await transaction.deliveryNeighborhood.findFirst({
      where: {
        storeId,
        normalizedName,
        NOT: { id: neighborhoodId },
      },
      select: { id: true },
    });
    if (clash) return { kind: "duplicate" };
  }

  try {
    const updated = await transaction.deliveryNeighborhood.update({
      where: { id: neighborhoodId },
      data: { feeCents, name, normalizedName },
      select: {
        feeCents: true,
        id: true,
        name: true,
        normalizedName: true,
        sortOrder: true,
      },
    });
    return { kind: "updated", neighborhood: mapNeighborhood(updated) };
  } catch {
    return { kind: "duplicate" };
  }
}

export async function deleteDeliveryNeighborhood(
  transaction: Prisma.TransactionClient,
  storeId: string,
  neighborhoodId: string,
): Promise<boolean> {
  const deleted = await transaction.deliveryNeighborhood.deleteMany({
    where: { id: neighborhoodId, storeId },
  });
  return deleted.count === 1;
}

export async function reorderDeliveryNeighborhoods(
  transaction: Prisma.TransactionClient,
  storeId: string,
  orderedIds: string[],
): Promise<DeliveryNeighborhoodView[] | null> {
  const existing = await transaction.deliveryNeighborhood.findMany({
    where: { storeId },
    select: { id: true },
  });
  if (
    existing.length !== orderedIds.length ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return null;
  }
  const existingIds = new Set(existing.map((row) => row.id));
  if (!orderedIds.every((id) => existingIds.has(id))) return null;

  const now = new Date();
  for (const [index, id] of orderedIds.entries()) {
    await transaction.deliveryNeighborhood.update({
      where: { id },
      data: { sortOrder: index, updatedAt: now },
    });
  }
  const config = await getStoreDeliveryConfig(transaction, storeId);
  return config.neighborhoods;
}

export function toPublicDeliveryConfig(
  config: StoreDeliveryConfigView,
): PublicDeliveryConfigView {
  return {
    deliveryAvailable: config.mode !== null,
    fixedDeliveryFeeCents:
      config.mode === "fixed" ? config.fixedDeliveryFeeCents : null,
    mode: config.mode,
    neighborhoods:
      config.mode === "neighborhood"
        ? config.neighborhoods.map((entry) => ({
            feeCents: entry.feeCents,
            name: entry.name,
          }))
        : [],
    pickupEnabled: config.pickupEnabled,
  };
}
