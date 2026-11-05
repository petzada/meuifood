import type { Prisma } from "./generated/prisma/client.js";

export type ComplementOptionView = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ComplementGroupView = {
  id: string;
  itemId: string;
  name: string;
  options: ComplementOptionView[];
  required: boolean;
  sortOrder: number;
};

export type AdditionalView = {
  available: boolean;
  id: string;
  itemId: string;
  name: string;
  priceCents: number;
  sortOrder: number;
};

export type PublicComplementOptionView = {
  id: string;
  name: string;
};

export type PublicComplementGroupView = {
  id: string;
  name: string;
  options: PublicComplementOptionView[];
  required: boolean;
};

export type PublicAdditionalView = {
  id: string;
  name: string;
  priceCents: number;
};

export const complementOptionSelect = {
  id: true,
  name: true,
  sortOrder: true,
} satisfies Prisma.MenuComplementOptionSelect;

export const complementGroupSelect = {
  id: true,
  itemId: true,
  name: true,
  required: true,
  sortOrder: true,
} satisfies Prisma.MenuComplementGroupSelect;

export const additionalSelect = {
  available: true,
  id: true,
  itemId: true,
  name: true,
  priceCents: true,
  sortOrder: true,
} satisfies Prisma.MenuAdditionalSelect;

export async function listItemCustomizations(
  storeTransaction: Prisma.TransactionClient,
  itemIds: string[],
): Promise<{
  additionals: AdditionalView[];
  complementGroups: ComplementGroupView[];
}> {
  if (itemIds.length === 0) {
    return { additionals: [], complementGroups: [] };
  }

  const [groups, options, additionals] = await Promise.all([
    storeTransaction.menuComplementGroup.findMany({
      where: { itemId: { in: itemIds } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: complementGroupSelect,
    }),
    storeTransaction.menuComplementOption.findMany({
      where: {
        group: { itemId: { in: itemIds } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        ...complementOptionSelect,
        groupId: true,
      },
    }),
    storeTransaction.menuAdditional.findMany({
      where: { itemId: { in: itemIds } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: additionalSelect,
    }),
  ]);

  const optionsByGroup = new Map<string, ComplementOptionView[]>();
  for (const option of options) {
    const list = optionsByGroup.get(option.groupId) ?? [];
    list.push({
      id: option.id,
      name: option.name,
      sortOrder: option.sortOrder,
    });
    optionsByGroup.set(option.groupId, list);
  }

  return {
    additionals,
    complementGroups: groups.map((group) => ({
      ...group,
      options: optionsByGroup.get(group.id) ?? [],
    })),
  };
}

export async function createComplementGroupWithOptions(
  storeTransaction: Prisma.TransactionClient,
  storeId: string,
  input: {
    itemId: string;
    name: string;
    options: Array<{ name: string }>;
    required: boolean;
  },
): Promise<ComplementGroupView | null> {
  const item = await storeTransaction.menuItem.findFirst({
    where: { id: input.itemId, storeId },
    select: { id: true },
  });
  if (!item) return null;

  if (input.required && input.options.length === 0) {
    throw new Error("required_group_needs_options");
  }
  const normalizedOptionNames = input.options.map(({ name }) =>
    name.toLocaleLowerCase("pt-BR"),
  );
  if (new Set(normalizedOptionNames).size !== normalizedOptionNames.length) {
    throw new Error("duplicate_complement_options");
  }

  const aggregate = await storeTransaction.menuComplementGroup.aggregate({
    where: { itemId: input.itemId },
    _max: { sortOrder: true },
  });
  const sortOrder = (aggregate._max.sortOrder ?? -1) + 1;

  const group = await storeTransaction.menuComplementGroup.create({
    data: {
      itemId: input.itemId,
      name: input.name,
      required: input.required,
      sortOrder,
      storeId,
      options: {
        create: input.options.map((option, index) => ({
          name: option.name,
          sortOrder: index,
          storeId,
        })),
      },
    },
    select: {
      ...complementGroupSelect,
      options: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: complementOptionSelect,
      },
    },
  });

  return group;
}

export async function replaceComplementGroupOptions(
  storeTransaction: Prisma.TransactionClient,
  storeId: string,
  groupId: string,
  input: {
    name?: string;
    options: Array<{ name: string }>;
    required?: boolean;
  },
): Promise<ComplementGroupView | null> {
  const existing = await storeTransaction.menuComplementGroup.findFirst({
    where: { id: groupId, storeId },
    select: {
      ...complementGroupSelect,
      options: {
        select: { id: true, name: true },
      },
    },
  });
  if (!existing) return null;

  const nextRequired = input.required ?? existing.required;
  if (nextRequired && input.options.length === 0) {
    throw new Error("required_group_needs_options");
  }
  const normalizedOptionNames = input.options.map(({ name }) =>
    name.toLocaleLowerCase("pt-BR"),
  );
  if (new Set(normalizedOptionNames).size !== normalizedOptionNames.length) {
    throw new Error("duplicate_complement_options");
  }

  const existingByName = new Map(
    existing.options.map((option) => [
      option.name.toLocaleLowerCase("pt-BR"),
      option,
    ]),
  );
  const retainedOptionIds: string[] = [];
  for (const [sortOrder, option] of input.options.entries()) {
    const existingOption = existingByName.get(
      option.name.toLocaleLowerCase("pt-BR"),
    );
    if (existingOption) {
      retainedOptionIds.push(existingOption.id);
      await storeTransaction.menuComplementOption.update({
        where: { id: existingOption.id },
        data: { name: option.name, sortOrder },
      });
    } else {
      const created = await storeTransaction.menuComplementOption.create({
        data: {
          groupId,
          name: option.name,
          sortOrder,
          storeId,
        },
        select: { id: true },
      });
      retainedOptionIds.push(created.id);
    }
  }

  await storeTransaction.menuComplementOption.deleteMany({
    where: {
      groupId,
      storeId,
      ...(retainedOptionIds.length === 0
        ? {}
        : { id: { notIn: retainedOptionIds } }),
    },
  });

  await storeTransaction.menuComplementGroup.update({
    where: { id: groupId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.required === undefined ? {} : { required: input.required }),
    },
  });

  const group = await storeTransaction.menuComplementGroup.findUnique({
    where: { id: groupId },
    select: {
      ...complementGroupSelect,
      options: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: complementOptionSelect,
      },
    },
  });
  return group;
}

export async function deleteComplementGroup(
  storeTransaction: Prisma.TransactionClient,
  storeId: string,
  groupId: string,
): Promise<boolean> {
  const result = await storeTransaction.menuComplementGroup.deleteMany({
    where: { id: groupId, storeId },
  });
  return result.count === 1;
}

export async function reorderComplementGroups(
  storeTransaction: Prisma.TransactionClient,
  storeId: string,
  itemId: string,
  orderedGroupIds: string[],
): Promise<ComplementGroupView[] | null> {
  const item = await storeTransaction.menuItem.findFirst({
    where: { id: itemId, storeId },
    select: { id: true },
  });
  if (!item) return null;

  const existing = await storeTransaction.menuComplementGroup.findMany({
    where: { itemId, storeId },
    select: { id: true },
  });
  if (
    existing.length !== orderedGroupIds.length ||
    new Set(orderedGroupIds).size !== orderedGroupIds.length
  ) {
    return null;
  }
  const existingIds = new Set(existing.map(({ id }) => id));
  if (orderedGroupIds.some((id) => !existingIds.has(id))) {
    return null;
  }

  await Promise.all(
    orderedGroupIds.map((id, index) =>
      storeTransaction.menuComplementGroup.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  const { complementGroups } = await listItemCustomizations(storeTransaction, [
    itemId,
  ]);
  return complementGroups;
}

export async function createAdditional(
  storeTransaction: Prisma.TransactionClient,
  storeId: string,
  input: {
    available?: boolean;
    itemId: string;
    name: string;
    priceCents: number;
  },
): Promise<AdditionalView | null> {
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new Error("invalid_price_cents");
  }

  const item = await storeTransaction.menuItem.findFirst({
    where: { id: input.itemId, storeId },
    select: { id: true },
  });
  if (!item) return null;

  const aggregate = await storeTransaction.menuAdditional.aggregate({
    where: { itemId: input.itemId },
    _max: { sortOrder: true },
  });
  const sortOrder = (aggregate._max.sortOrder ?? -1) + 1;

  return await storeTransaction.menuAdditional.create({
    data: {
      available: input.available ?? true,
      itemId: input.itemId,
      name: input.name,
      priceCents: input.priceCents,
      sortOrder,
      storeId,
    },
    select: additionalSelect,
  });
}

export async function updateAdditional(
  storeTransaction: Prisma.TransactionClient,
  storeId: string,
  additionalId: string,
  input: {
    available?: boolean;
    name?: string;
    priceCents?: number;
  },
): Promise<AdditionalView | null> {
  if (
    input.priceCents !== undefined &&
    (!Number.isInteger(input.priceCents) || input.priceCents < 0)
  ) {
    throw new Error("invalid_price_cents");
  }

  const result = await storeTransaction.menuAdditional.updateMany({
    where: { id: additionalId, storeId },
    data: {
      ...(input.available === undefined ? {} : { available: input.available }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.priceCents === undefined
        ? {}
        : { priceCents: input.priceCents }),
    },
  });
  if (result.count === 0) return null;

  return await storeTransaction.menuAdditional.findUnique({
    where: { id: additionalId },
    select: additionalSelect,
  });
}

export async function deleteAdditional(
  storeTransaction: Prisma.TransactionClient,
  storeId: string,
  additionalId: string,
): Promise<boolean> {
  const result = await storeTransaction.menuAdditional.deleteMany({
    where: { id: additionalId, storeId },
  });
  return result.count === 1;
}

export async function reorderAdditionals(
  storeTransaction: Prisma.TransactionClient,
  storeId: string,
  itemId: string,
  orderedAdditionalIds: string[],
): Promise<AdditionalView[] | null> {
  const item = await storeTransaction.menuItem.findFirst({
    where: { id: itemId, storeId },
    select: { id: true },
  });
  if (!item) return null;

  const existing = await storeTransaction.menuAdditional.findMany({
    where: { itemId, storeId },
    select: { id: true },
  });
  if (
    existing.length !== orderedAdditionalIds.length ||
    new Set(orderedAdditionalIds).size !== orderedAdditionalIds.length
  ) {
    return null;
  }
  const existingIds = new Set(existing.map(({ id }) => id));
  if (orderedAdditionalIds.some((id) => !existingIds.has(id))) {
    return null;
  }

  await Promise.all(
    orderedAdditionalIds.map((id, index) =>
      storeTransaction.menuAdditional.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  return await storeTransaction.menuAdditional.findMany({
    where: { itemId, storeId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: additionalSelect,
  });
}
