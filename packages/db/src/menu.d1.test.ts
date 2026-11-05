// Cardápio no D1 (Ticket 23): CRUD com auditoria, regras no servidor (4 Destaques, min ≤ opções,
// categoria com itens), cópia de grupos e isolamento entre duas Lojas — leitura e escrita
// cruzadas, id adivinhado e FK composta. Roda só no CI (vitest.workers.config.ts).
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { type StoreContext } from "./context";
import { createFoodeDb, type FoodeDb, MENU_MAX_FEATURED } from "./index";
import { seedTwoStores, type TwoStoresFixture } from "./testing";

let db: FoodeDb;
let fx: TwoStoresFixture;

async function contextOf(userId: string, storeId: string): Promise<StoreContext> {
  const context = await db.access.storeContext({ userId, storeId });
  if (!context) throw new Error("membership esperada na fixture");
  return context;
}

const menuA = async () => db.store(await contextOf(fx.ownerA.id, fx.storeA.id)).menu();
const menuB = async () => db.store(await contextOf(fx.ownerB.id, fx.storeB.id)).menu();

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`esperava ok, veio ${result.error}`);
  return result.data;
}

async function auditActions(): Promise<string[]> {
  const trail = await db.store(await contextOf(fx.ownerA.id, fx.storeA.id)).auditTrail(200);
  return trail.map((event) => event.action);
}

/** Categoria + item básicos na Loja A. */
async function seedItemA(overrides: { featured?: boolean; name?: string } = {}) {
  const menu = await menuA();
  const { categoryId } = unwrap(await menu.createCategory({ name: "Lanches", available: true }));
  const { itemId } = unwrap(
    await menu.createItem({
      categoryId,
      name: overrides.name ?? "X-Burger",
      description: "Pão, carne e queijo",
      priceCents: 2590,
      available: true,
      featured: overrides.featured ?? false,
      imageObjectKey: null,
    }),
  );
  return { menu, categoryId, itemId };
}

beforeEach(async () => {
  db = createFoodeDb(env.DB);
  fx = await seedTwoStores(env.DB);
});

describe("CRUD do Cardápio com auditoria", () => {
  it("categoria, item, grupo com opções pagas e Adicional; leitura na ordem do Dono", async () => {
    const { menu, categoryId, itemId } = await seedItemA();
    const { categoryId: drinks } = unwrap(
      await menu.createCategory({ name: "Bebidas", available: true }),
    );
    const { groupId } = unwrap(
      await menu.createComplementGroup({
        itemId,
        name: "Borda",
        minSelect: 1,
        maxSelect: 1,
        options: [
          { name: "Tradicional", priceCents: 0 },
          { name: "Catupiry", priceCents: 990 },
        ],
      }),
    );
    unwrap(
      await menu.createAdditional({ itemId, name: "Bacon", priceCents: 500, available: true }),
    );

    const read = await menu.get();
    expect(read.categories.map((category) => category.id)).toEqual([categoryId, drinks]);
    const item = read.categories[0]!.items[0]!;
    expect(item).toMatchObject({ id: itemId, priceCents: 2590, available: true, featured: false });
    expect(item.complementGroups).toEqual([
      {
        id: groupId,
        name: "Borda",
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: expect.any(String), name: "Tradicional", priceCents: 0 },
          { id: expect.any(String), name: "Catupiry", priceCents: 990 },
        ],
      },
    ]);
    expect(item.additionals).toMatchObject([{ name: "Bacon", priceCents: 500, available: true }]);

    // Preço inline (P-CAR-5) e disponibilidade inline (CAR-02).
    unwrap(await menu.updateItem({ itemId, priceCents: 2790 }));
    unwrap(await menu.updateCategory({ categoryId: drinks, available: false }));
    unwrap(await menu.reorderCategories([drinks, categoryId]));
    const after = await menu.get();
    expect(after.categories.map((category) => [category.id, category.available])).toEqual([
      [drinks, false],
      [categoryId, true],
    ]);
    expect(after.categories[1]!.items[0]!.priceCents).toBe(2790);

    expect(await auditActions()).toEqual(
      expect.arrayContaining([
        "menu.category_created",
        "menu.item_created",
        "menu.group_created",
        "menu.additional_created",
        "menu.item_updated",
        "menu.category_updated",
        "menu.categories_reordered",
      ]),
    );
  });

  it("categoria com itens não é apagada; vazia é", async () => {
    const { menu, categoryId, itemId } = await seedItemA();
    await expect(menu.deleteCategory(categoryId)).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    unwrap(await menu.deleteItem(itemId));
    await expect(menu.deleteCategory(categoryId)).resolves.toEqual({ ok: true, data: null });
    expect((await menu.get()).categories).toEqual([]);
  });

  it("apagar item leva grupos, opções e Adicionais (cascade) e devolve a chave da imagem", async () => {
    const { menu, categoryId } = await seedItemA();
    const key = `stores/${fx.storeA.id}/menu/${crypto.randomUUID()}.webp`;
    const { itemId } = unwrap(
      await menu.createItem({
        categoryId,
        name: "Com foto",
        description: "",
        priceCents: 100,
        available: true,
        featured: false,
        imageObjectKey: key,
      }),
    );
    unwrap(
      await menu.createComplementGroup({
        itemId,
        name: "Ponto",
        minSelect: 0,
        maxSelect: 1,
        options: [{ name: "Mal passado", priceCents: 0 }],
      }),
    );
    await expect(menu.deleteItem(itemId)).resolves.toEqual({
      ok: true,
      data: { imageObjectKey: key },
    });
    const orphans = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM menu_complement_options WHERE store_id = ?",
    )
      .bind(fx.storeA.id)
      .first<{ n: number }>();
    expect(orphans?.n).toBe(0);
  });

  it("reordenar exige o conjunto exato de irmãos", async () => {
    const { menu, categoryId, itemId } = await seedItemA();
    const { itemId: second } = unwrap(
      await menu.createItem({
        categoryId,
        name: "X-Salada",
        description: "",
        priceCents: 2290,
        available: true,
        featured: false,
        imageObjectKey: null,
      }),
    );
    await expect(menu.reorderItems(categoryId, [second])).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    unwrap(await menu.reorderItems(categoryId, [second, itemId]));
    expect((await menu.get()).categories[0]!.items.map((item) => item.id)).toEqual([
      second,
      itemId,
    ]);
  });
});

describe("regras no servidor", () => {
  it(`no máximo ${MENU_MAX_FEATURED} Destaques por Loja, na criação e na edição`, async () => {
    const { menu, categoryId } = await seedItemA({ featured: true });
    for (let i = 1; i < MENU_MAX_FEATURED; i++) {
      unwrap(
        await menu.createItem({
          categoryId,
          name: `Destaque ${i}`,
          description: "",
          priceCents: 100,
          available: true,
          featured: true,
          imageObjectKey: null,
        }),
      );
    }
    await expect(
      menu.createItem({
        categoryId,
        name: "Quinto",
        description: "",
        priceCents: 100,
        available: true,
        featured: true,
        imageObjectKey: null,
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
    const { itemId } = unwrap(
      await menu.createItem({
        categoryId,
        name: "Normal",
        description: "",
        priceCents: 100,
        available: true,
        featured: false,
        imageObjectKey: null,
      }),
    );
    await expect(menu.updateItem({ itemId, featured: true })).resolves.toEqual({
      ok: false,
      error: "conflict",
    });
    const featured = (await menu.get()).categories
      .flatMap((category) => category.items)
      .filter((item) => item.featured);
    expect(featured).toHaveLength(MENU_MAX_FEATURED);
    // Um Destaque que já é Destaque pode ser editado normalmente.
    unwrap(await menu.updateItem({ itemId: featured[0]!.id, featured: true, name: "Renomeado" }));
    // A Loja B tem a própria cota.
    const other = await menuB();
    const { categoryId: catB } = unwrap(await other.createCategory({ name: "B", available: true }));
    unwrap(
      await other.createItem({
        categoryId: catB,
        name: "Destaque B",
        description: "",
        priceCents: 100,
        available: true,
        featured: true,
        imageObjectKey: null,
      }),
    );
  });

  it("min ≤ número de opções, conferido na mesma escrita (nada muda se quebrar)", async () => {
    const { menu, itemId } = await seedItemA();
    const { groupId } = unwrap(
      await menu.createComplementGroup({
        itemId,
        name: "Molhos",
        minSelect: 2,
        maxSelect: 3,
        options: [
          { name: "Barbecue", priceCents: 0 },
          { name: "Mostarda", priceCents: 0 },
          { name: "Alho", priceCents: 200 },
        ],
      }),
    );
    const before = (await menu.get()).categories[0]!.items[0]!.complementGroups[0]!;
    // Ficar com 1 opção e min 2: recusado e o batch inteiro volta.
    await expect(
      menu.updateComplementGroup({
        groupId,
        name: "Molhos!",
        options: [{ id: before.options[0]!.id, name: "Barbecue", priceCents: 100 }],
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    // min > opções gravadas sem mandar a lista.
    await expect(
      menu.updateComplementGroup({ groupId, minSelect: 3, maxSelect: 4 }),
    ).resolves.toEqual({ ok: true, data: null });
    await expect(menu.updateComplementGroup({ groupId, minSelect: 4 })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    // min > max também é recusado (CHECK do schema).
    await expect(menu.updateComplementGroup({ groupId, maxSelect: 1 })).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    const after = (await menu.get()).categories[0]!.items[0]!.complementGroups[0]!;
    expect(after).toEqual({ ...before, minSelect: 3, maxSelect: 4 });

    // Lista completa: atualiza, cria e apaga na nova ordem.
    unwrap(
      await menu.updateComplementGroup({
        groupId,
        minSelect: 1,
        options: [
          { id: before.options[2]!.id, name: "Alho", priceCents: 250 },
          { name: "Pimenta", priceCents: 0 },
        ],
      }),
    );
    const edited = (await menu.get()).categories[0]!.items[0]!.complementGroups[0]!;
    expect(edited.options.map((option) => [option.name, option.priceCents])).toEqual([
      ["Alho", 250],
      ["Pimenta", 0],
    ]);
    expect(edited.options[0]!.id).toBe(before.options[2]!.id);
  });

  it("copiar grupos de outro item: ids novos, opções e preços copiados, original intacto", async () => {
    const { menu, categoryId, itemId: source } = await seedItemA();
    const { groupId } = unwrap(
      await menu.createComplementGroup({
        itemId: source,
        name: "Borda",
        minSelect: 0,
        maxSelect: 1,
        options: [{ name: "Catupiry", priceCents: 990 }],
      }),
    );
    const { itemId: target } = unwrap(
      await menu.createItem({
        categoryId,
        name: "Pizza 2",
        description: "",
        priceCents: 4000,
        available: true,
        featured: false,
        imageObjectKey: null,
      }),
    );
    const { groupIds } = unwrap(
      await menu.copyComplementGroups({ sourceItemId: source, targetItemId: target }),
    );
    expect(groupIds).toHaveLength(1);
    expect(groupIds[0]).not.toBe(groupId);
    const items = (await menu.get()).categories[0]!.items;
    const copied = items.find((item) => item.id === target)!.complementGroups[0]!;
    const original = items.find((item) => item.id === source)!.complementGroups[0]!;
    expect(copied).toMatchObject({ name: "Borda", minSelect: 0, maxSelect: 1 });
    expect(copied.options.map((option) => [option.name, option.priceCents])).toEqual([
      ["Catupiry", 990],
    ]);
    expect(copied.options[0]!.id).not.toBe(original.options[0]!.id);
    // Editar a cópia não muda o original.
    unwrap(await menu.updateComplementGroup({ groupId: copied.id, name: "Borda nova" }));
    const again = (await menu.get()).categories[0]!.items;
    expect(again.find((item) => item.id === source)!.complementGroups[0]!.name).toBe("Borda");
    // Grupo que não é do item de origem = not_found.
    await expect(
      menu.copyComplementGroups({
        sourceItemId: source,
        targetItemId: target,
        groupIds: [copied.id],
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
  });
});

describe("isolamento entre duas Lojas (Cardápio)", () => {
  it("leitura cruzada: o Cardápio de B não traz nada de A", async () => {
    await seedItemA();
    expect((await (await menuB()).get()).categories).toEqual([]);
  });

  it("escrita cruzada com id adivinhado de A na sessão de B = not_found e nada muda", async () => {
    const { menu, categoryId, itemId } = await seedItemA();
    const { groupId } = unwrap(
      await menu.createComplementGroup({
        itemId,
        name: "Ponto",
        minSelect: 0,
        maxSelect: 1,
        options: [{ name: "Ao ponto", priceCents: 0 }],
      }),
    );
    const { additionalId } = unwrap(
      await menu.createAdditional({ itemId, name: "Ovo", priceCents: 300, available: true }),
    );
    const before = await menu.get();
    const other = await menuB();
    const notFound = { ok: false, error: "not_found" };

    await expect(other.updateCategory({ categoryId, name: "Invadido" })).resolves.toEqual(notFound);
    await expect(other.deleteCategory(categoryId)).resolves.toEqual(notFound);
    await expect(other.updateItem({ itemId, priceCents: 1 })).resolves.toEqual(notFound);
    await expect(other.deleteItem(itemId)).resolves.toEqual(notFound);
    await expect(
      other.createItem({
        categoryId,
        name: "Intruso",
        description: "",
        priceCents: 1,
        available: true,
        featured: false,
        imageObjectKey: null,
      }),
    ).resolves.toEqual(notFound);
    await expect(
      other.createComplementGroup({
        itemId,
        name: "Intruso",
        minSelect: 0,
        maxSelect: 1,
        options: [{ name: "x", priceCents: 0 }],
      }),
    ).resolves.toEqual(notFound);
    await expect(other.updateComplementGroup({ groupId, name: "Invadido" })).resolves.toEqual(
      notFound,
    );
    await expect(other.deleteComplementGroup(groupId)).resolves.toEqual(notFound);
    await expect(
      other.createAdditional({ itemId, name: "Intruso", priceCents: 1, available: true }),
    ).resolves.toEqual(notFound);
    await expect(other.updateAdditional({ additionalId, priceCents: 1 })).resolves.toEqual(
      notFound,
    );
    await expect(other.deleteAdditional(additionalId)).resolves.toEqual(notFound);
    await expect(other.reorderItems(categoryId, [itemId])).resolves.toEqual(notFound);

    // Mover item de B para uma categoria de A também não passa.
    const { categoryId: catB } = unwrap(await other.createCategory({ name: "B", available: true }));
    const { itemId: itemB } = unwrap(
      await other.createItem({
        categoryId: catB,
        name: "Item B",
        description: "",
        priceCents: 100,
        available: true,
        featured: false,
        imageObjectKey: null,
      }),
    );
    await expect(other.updateItem({ itemId: itemB, categoryId })).resolves.toEqual(notFound);
    // Copiar grupos de um item de A para um de B também não.
    await expect(
      other.copyComplementGroups({ sourceItemId: itemId, targetItemId: itemB }),
    ).resolves.toEqual(notFound);

    expect(await menu.get()).toEqual(before);
  });

  it("FK composta: o banco recusa filho de uma Loja apontando para pai de outra", async () => {
    const { categoryId, itemId } = await seedItemA();
    const now = new Date().toISOString();
    await expect(
      env.DB.prepare(
        `INSERT INTO menu_items (id, store_id, category_id, name, price_cents, created_at, updated_at)
         VALUES (?, ?, ?, 'Intruso', 100, ?, ?)`,
      )
        .bind(crypto.randomUUID(), fx.storeB.id, categoryId, now, now)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      env.DB.prepare(
        `INSERT INTO menu_additionals (id, store_id, item_id, name, price_cents, created_at, updated_at)
         VALUES (?, ?, ?, 'Intruso', 100, ?, ?)`,
      )
        .bind(crypto.randomUUID(), fx.storeB.id, itemId, now, now)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
    // Imagem com prefixo de outra Loja: CHECK do schema.
    await expect(
      env.DB.prepare("UPDATE menu_items SET image_object_key = ? WHERE id = ?")
        .bind(`stores/${fx.storeB.id}/menu/${crypto.randomUUID()}.png`, itemId)
        .run(),
    ).rejects.toThrow(/CHECK/);
  });

  it("Operador não escreve no Cardápio nem pela porta do pacote", async () => {
    const operator = db.store(await contextOf(fx.operatorA.id, fx.storeA.id)).menu();
    await expect(operator.createCategory({ name: "X", available: true })).rejects.toThrow(
      /forbidden/,
    );
    await expect(operator.get()).rejects.toThrow(/forbidden/);
  });
});

describe("Storefront público (@foode/db)", () => {
  it("só Loja active; só categorias disponíveis com itens; itens indisponíveis marcados", async () => {
    const { menu, categoryId, itemId } = await seedItemA();
    unwrap(await menu.createCategory({ name: "Vazia", available: true }));
    const { categoryId: hidden } = unwrap(
      await menu.createCategory({ name: "Escondida", available: false }),
    );
    unwrap(
      await menu.createItem({
        categoryId: hidden,
        name: "Oculto",
        description: "",
        priceCents: 100,
        available: true,
        featured: false,
        imageObjectKey: null,
      }),
    );
    unwrap(await menu.updateItem({ itemId, available: false }));

    const publicMenu = await db.storefront.publicMenuBySlug(fx.storeA.slug);
    expect(publicMenu?.categories.map((category) => category.id)).toEqual([categoryId]);
    expect(publicMenu?.categories[0]!.items[0]).toMatchObject({ id: itemId, available: false });
    expect(JSON.stringify(publicMenu)).not.toContain(fx.storeA.id);

    const ops = await db.access.opsContext(fx.ops.id);
    await db.ops(ops!).changeStoreStatus(fx.storeA.id, "suspended", { allowedFrom: ["active"] });
    await expect(db.storefront.publicMenuBySlug(fx.storeA.slug)).resolves.toBeNull();
    await expect(db.storefront.publicMenuBySlug("nao-existe")).resolves.toBeNull();
  });
});
