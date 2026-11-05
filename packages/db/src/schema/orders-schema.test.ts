// Contrato do Ticket 24a sem banco: a migration 0004 cria cada tabela/coluna/índice/FK/CHECK do
// schema do Pedido e da configuração operacional, e é só expand. A prova no D1 (aplicar do zero,
// constraints, FKs compostas) e o drift completo (`migrations:check`) são do CI.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { orderLines, orders, orderStatusEvents, phoneLookups } from "./orders";
import {
  deliveryNeighborhoods,
  storeOpeningPeriods,
  storeOperationSettings,
} from "./store-operation";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
const migration = readFileSync(join(migrationsDir, "0004_storefront_pedido.sql"), "utf8");
const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

const tables: SQLiteTable[] = [
  storeOperationSettings,
  storeOpeningPeriods,
  deliveryNeighborhoods,
  orders,
  orderLines,
  orderStatusEvents,
  phoneLookups,
];

function tableSql(name: string): string {
  return migration.match(new RegExp(`CREATE TABLE \`${name}\` \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
}

describe("migration 0004 × schema/orders.ts + schema/store-operation.ts", () => {
  for (const table of tables) {
    const config = getTableConfig(table);

    it(`cria ${config.name} com todas as colunas e checks do schema`, () => {
      const body = tableSql(config.name);
      expect(body, config.name).not.toBe("");
      for (const check of config.checks) expect(body).toContain(`CONSTRAINT "${check.name}"`);
      const columnsInSql = [...body.matchAll(/^\t`(\w+)` /gm)].map((m) => m[1]);
      expect(columnsInSql.sort()).toEqual(config.columns.map((c) => c.name).sort());
      expect(body, "store_id em toda tabela").toMatch(/`store_id` text (PRIMARY KEY )?NOT NULL/);
    });

    for (const index of config.indexes) {
      it(`cria o índice ${index.config.name}`, () => {
        expect(migration).toContain(`INDEX \`${index.config.name}\` ON \`${config.name}\``);
      });
    }
  }

  it("filhos do Pedido apontam pela FK composta (store_id, order_id): sem vínculo entre Lojas", () => {
    for (const child of ["order_lines", "order_status_events"]) {
      expect(tableSql(child)).toContain(
        "FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade",
      );
    }
    expect(tableSql("phone_lookups")).toContain(
      "FOREIGN KEY (`store_id`,`matched_order_id`) REFERENCES `orders`(`store_id`,`id`)",
    );
  });

  it("idempotência, código e token: únicos no escopo certo", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `orders_store_idempotency_unique` ON `orders` (`store_id`,`idempotency_key`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `orders_store_code_unique` ON `orders` (`store_id`,`code`)",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `orders_access_token_hash_unique` ON `orders` (`access_token_hash`)",
    );
  });

  it("busca por telefone fica na mesma Loja (índice começa por store_id) e sem telefone na auditoria", () => {
    expect(migration).toContain(
      "INDEX `orders_store_phone_created_idx` ON `orders` (`store_id`,`customer_phone_e164`,`created_at`)",
    );
    const columns = [...tableSql("phone_lookups").matchAll(/^\t`(\w+)` /gm)].map((m) => m[1]);
    expect(columns.filter((name) => /phone|^ip$/u.test(name ?? ""))).toEqual([]);
  });

  it("enums do Pedido seguem a decisão 09 e os meios da spec v3", () => {
    expect(tableSql("orders")).toContain(
      `"status" IN ('received', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled')`,
    );
    expect(tableSql("orders")).toContain(`"payment_method" IN ('pix', 'credit', 'on_delivery')`);
    expect(tableSql("orders")).toContain(`"fulfillment" IN ('delivery', 'pickup')`);
  });

  it("totais, troco e observação conferidos no banco", () => {
    const body = tableSql("orders");
    expect(body).toContain(
      `"total_cents" = "items_subtotal_cents" + "delivery_fee_cents" - "discount_cents"`,
    );
    expect(body).toContain(`"change_for_cents" >= "total_cents"`);
    expect(body).toContain(`length("note") BETWEEN 1 AND 200`);
  });

  it("Pausa guarda quem ativou; bairro tem interruptor; horário HH:MM sem overnight", () => {
    expect(tableSql("store_operation_settings")).toContain("`paused_by_user_id` text");
    expect(tableSql("store_operation_settings")).toContain(
      "`print_on_accept` integer DEFAULT false NOT NULL",
    );
    expect(tableSql("delivery_neighborhoods")).toContain("`active` integer DEFAULT true NOT NULL");
    expect(tableSql("store_opening_periods")).toContain(`"opens_at" < "closes_at"`);
  });

  it("é só expand (sem DROP/RENAME/ALTER/recriação)", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b|\bALTER\b|__new_/i);
  });

  it("não usa GLOB/LIKE (limite de 50 bytes do D1)", () => {
    expect(migration).not.toMatch(/\b(GLOB|LIKE)\b/i);
  });

  it("datas com utcCheck", () => {
    for (const table of tables) {
      const body = tableSql(getTableConfig(table).name);
      expect(body).toMatch(/strftime\('%Y-%m-%dT%H:%M:%fZ', "(created_at|occurred_at)"\) IS/);
    }
  });

  it("0004 é o número reservado ao Ticket 24a", () => {
    expect(journal.entries.find((entry) => entry.tag === "0004_storefront_pedido")?.idx).toBe(4);
  });
});
