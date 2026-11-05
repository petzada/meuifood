// Pedido no D1 (Ticket 24a, migration 0004; Tickets 08/09 + decisões 09, 39, 43, 63). Contrato
// em @foode/shared/order. Convenções de fundacao.ts: datas ISO UTC (`utcCheck`), centavos, UUID.
//
// - `orders`: snapshot do que o Consumidor comprou (nome, telefone E.164, endereço, Fulfillment,
//   meio, troco, observação, tempo estimado, totais). `code` = número sequencial por Loja ("#123"),
//   calculado no INSERT … SELECT do `batch`. `access_token_hash` = SHA-256 hex do token da página
//   do Pedido (o token não é gravado; a api o deriva por HMAC do id com o secret
//   ORDER_TOKEN_SECRET, então o Painel consegue montar o link do "Avisar no WhatsApp").
//   Idempotência: UNIQUE (store_id, idempotency_key) + hash do corpo normalizado.
//   `discount_cents` (Cupom, Ticket 13) já existe com 0 para o CHECK do total não precisar mudar.
//   `customer_account_id` (Ticket 13, 0006): conta do Consumidor; ADD COLUMN nullable (expand).
//   Status por TEXT + CHECK: um estado novo exigiria recriar a tabela (contract) — estado do
//   pagamento online entra como coluna própria nos Tickets 26/27, não como status.
// - `order_lines`: linha com snapshot das escolhas em JSON (arrays de @foode/shared/order).
//   `menu_item_id` sem FK: o item pode sumir do Cardápio e o Pedido continua igual.
// - `order_status_events`: histórico/auditoria de cada mudança de estado (quem, papel, quando);
//   a criação grava `from_status` NULL e `actor_user_id` NULL (Consumidor).
// - `phone_lookups`: auditoria da busca por telefone (P-2.1) e o token de uso único do "Sou eu".
//   Sem telefone em claro: IP só como hash; resultado; Pedido encontrado na mesma Loja (FK
//   composta). Também é a base do rate limit por IP (índice por ip_hash + instante).
// FKs compostas (store_id, order_id) → orders (store_id, id): nada aponta para Pedido de outra Loja.
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { customerAccounts } from "./customers";
import { inList, stores, users, utcCheck, utcNowDefault } from "./fundacao";
import { MENU_MAX_CENTS, MENU_NAME_MAX } from "./menu";
import {
  DELIVERY_MODES,
  ETA_MAX_MINUTES,
  NEIGHBORHOOD_NAME_MAX,
  PAUSE_ROLES,
} from "./store-operation";

export const ORDER_STATUSES = [
  "received",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const ORDER_FULFILLMENTS = ["delivery", "pickup"] as const;
export const ORDER_PAYMENT_METHODS = ["pix", "credit", "on_delivery"] as const;
/** Estado do pagamento no Pedido (Ticket 26). Fila do Painel = `not_required` ou `paid`. */
export const ORDER_PAYMENT_STATUSES = [
  "not_required",
  "awaiting",
  "paid",
  "expired",
  "failed",
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];
/** Pedidos que o Painel enxerga (fila, detalhe, avanço): pagos ou sem pagamento online. */
export const PAINEL_VISIBLE_PAYMENT_SQL = `payment_status IN ('not_required', 'paid')`;
export const PHONE_LOOKUP_RESULTS = [
  "found",
  "not_found",
  "rate_limited",
  "captcha_failed",
] as const;

/** Limites iguais aos de @foode/shared/order (conferidos em apps/api/src/order-contract.test.ts). */
export const ORDER_NOTE_MAX = 200;
export const ORDER_CUSTOMER_NAME_MAX = 120;
export const ORDER_STREET_MAX = 200;
export const ORDER_ADDRESS_NUMBER_MAX = 20;
export const ORDER_ADDRESS_COMPLEMENT_MAX = 120;
export const ORDER_ADDRESS_REFERENCE_MAX = 160;
export const ORDER_LINE_QUANTITY_MAX = 99;

function centsCheck(column: string, min = 0) {
  return sql.raw(`"${column}" BETWEEN ${min} AND ${MENU_MAX_CENTS}`);
}

function hexHashCheck(column: string) {
  return sql.raw(`length("${column}") = 64 AND lower("${column}") = "${column}"`);
}

function optionalLength(column: string, max: number) {
  return sql.raw(`"${column}" IS NULL OR length("${column}") BETWEEN 1 AND ${max}`);
}

function jsonArrayCheck(column: string) {
  return sql.raw(`json_valid("${column}") AND json_type("${column}") = 'array'`);
}

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    code: integer("code").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    idempotencyPayloadHash: text("idempotency_payload_hash").notNull(),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("received"),
    fulfillment: text("fulfillment", { enum: ORDER_FULFILLMENTS }).notNull(),
    paymentMethod: text("payment_method", { enum: ORDER_PAYMENT_METHODS }).notNull(),
    customerName: text("customer_name").notNull(),
    customerPhoneE164: text("customer_phone_e164").notNull(),
    deliveryPostalCode: text("delivery_postal_code"),
    deliveryStreet: text("delivery_street"),
    deliveryNumber: text("delivery_number"),
    deliveryComplement: text("delivery_complement"),
    deliveryReference: text("delivery_reference"),
    deliveryNeighborhood: text("delivery_neighborhood"),
    deliveryFeeMode: text("delivery_fee_mode", { enum: DELIVERY_MODES }),
    itemsSubtotalCents: integer("items_subtotal_cents").notNull(),
    deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    changeForCents: integer("change_for_cents"),
    note: text("note"),
    etaMinMinutes: integer("eta_min_minutes"),
    etaMaxMinutes: integer("eta_max_minutes"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
    updatedAt: text("updated_at").notNull().default(utcNowDefault),
    /** Conta do Consumidor (Ticket 13, migration 0006): Pedido autenticado ou Guest vinculado. */
    customerAccountId: text("customer_account_id").references(() => customerAccounts.id),
    /**
     * Estado do pagamento online (Ticket 26, migration 0007, expand): coluna própria em vez de um
     * status novo (que exigiria recriar `orders`). `not_required` = Pagamento na entrega (default
     * das linhas antigas); PIX nasce `awaiting` e só entra na fila do Painel em `paid`. Domínio
     * em ORDER_PAYMENT_STATUSES, conferido pela api e pelas escritas de @foode/db (ADD COLUMN com
     * CHECK de tabela obrigaria recriar a tabela).
     */
    paymentStatus: text("payment_status", { enum: ORDER_PAYMENT_STATUSES })
      .notNull()
      .default("not_required"),
    /**
     * Tarifa de serviço do pagamento online (decisão 71), FORA de `total_cents` (o CHECK
     * `orders_total_sum` segue valendo para o total do lojista). O Consumidor paga
     * `total_cents + service_fee_cents`; 0 no Pagamento na entrega.
     */
    serviceFeeCents: integer("service_fee_cents").notNull().default(0),
  },
  (table) => [
    index("orders_store_account_created_idx").on(
      table.storeId,
      table.customerAccountId,
      table.createdAt,
    ),
    uniqueIndex("orders_store_id_unique").on(table.storeId, table.id),
    uniqueIndex("orders_store_code_unique").on(table.storeId, table.code),
    uniqueIndex("orders_store_idempotency_unique").on(table.storeId, table.idempotencyKey),
    uniqueIndex("orders_access_token_hash_unique").on(table.accessTokenHash),
    index("orders_store_status_created_idx").on(table.storeId, table.status, table.createdAt),
    index("orders_store_created_idx").on(table.storeId, table.createdAt),
    index("orders_store_phone_created_idx").on(
      table.storeId,
      table.customerPhoneE164,
      table.createdAt,
    ),
    check("orders_code", sql.raw(`"code" >= 1`)),
    check("orders_access_token_hash", hexHashCheck("access_token_hash")),
    check("orders_idempotency_key", sql.raw(`length("idempotency_key") = 36`)),
    check("orders_idempotency_payload_hash", hexHashCheck("idempotency_payload_hash")),
    check("orders_status", sql.raw(inList("status", ORDER_STATUSES))),
    check("orders_fulfillment", sql.raw(inList("fulfillment", ORDER_FULFILLMENTS))),
    check("orders_payment_method", sql.raw(inList("payment_method", ORDER_PAYMENT_METHODS))),
    // Estado só existe no Fulfillment certo (decisão 09).
    check(
      "orders_status_fulfillment",
      sql.raw(
        `NOT ("fulfillment" = 'delivery' AND "status" = 'ready_for_pickup') AND NOT ("fulfillment" = 'pickup' AND "status" = 'out_for_delivery')`,
      ),
    ),
    check(
      "orders_customer_name",
      sql.raw(`length(trim("customer_name")) BETWEEN 1 AND ${ORDER_CUSTOMER_NAME_MAX}`),
    ),
    check("orders_customer_phone", sql.raw(`length("customer_phone_e164") = 13`)),
    check(
      "orders_delivery_postal_code",
      sql.raw(`"delivery_postal_code" IS NULL OR length("delivery_postal_code") = 8`),
    ),
    check("orders_delivery_street", optionalLength("delivery_street", ORDER_STREET_MAX)),
    check("orders_delivery_number", optionalLength("delivery_number", ORDER_ADDRESS_NUMBER_MAX)),
    check(
      "orders_delivery_complement",
      optionalLength("delivery_complement", ORDER_ADDRESS_COMPLEMENT_MAX),
    ),
    check(
      "orders_delivery_reference",
      optionalLength("delivery_reference", ORDER_ADDRESS_REFERENCE_MAX),
    ),
    check(
      "orders_delivery_neighborhood",
      optionalLength("delivery_neighborhood", NEIGHBORHOOD_NAME_MAX),
    ),
    check(
      "orders_delivery_fee_mode",
      sql.raw(`"delivery_fee_mode" IS NULL OR ${inList("delivery_fee_mode", DELIVERY_MODES)}`),
    ),
    // Delivery tem endereço e modo da taxa; Retirada não tem endereço nem taxa.
    check(
      "orders_address_by_fulfillment",
      sql.raw(
        `("fulfillment" = 'delivery' AND "delivery_street" IS NOT NULL AND "delivery_number" IS NOT NULL AND "delivery_neighborhood" IS NOT NULL AND "delivery_fee_mode" IS NOT NULL) OR ("fulfillment" = 'pickup' AND "delivery_postal_code" IS NULL AND "delivery_street" IS NULL AND "delivery_number" IS NULL AND "delivery_complement" IS NULL AND "delivery_reference" IS NULL AND "delivery_neighborhood" IS NULL AND "delivery_fee_mode" IS NULL AND "delivery_fee_cents" = 0)`,
      ),
    ),
    check("orders_items_subtotal_cents", centsCheck("items_subtotal_cents")),
    check("orders_delivery_fee_cents", centsCheck("delivery_fee_cents")),
    check("orders_discount_cents", centsCheck("discount_cents")),
    check("orders_total_cents", centsCheck("total_cents")),
    check(
      "orders_total_sum",
      sql.raw(
        `"discount_cents" <= "items_subtotal_cents" + "delivery_fee_cents" AND "total_cents" = "items_subtotal_cents" + "delivery_fee_cents" - "discount_cents"`,
      ),
    ),
    // Troco só no Pagamento na entrega e ≥ total (P-4.2).
    check(
      "orders_change_for",
      sql.raw(
        `"change_for_cents" IS NULL OR ("payment_method" = 'on_delivery' AND "change_for_cents" >= "total_cents" AND "change_for_cents" <= ${MENU_MAX_CENTS})`,
      ),
    ),
    check(
      "orders_note",
      sql.raw(`"note" IS NULL OR length("note") BETWEEN 1 AND ${ORDER_NOTE_MAX}`),
    ),
    check(
      "orders_eta",
      sql.raw(
        `("eta_min_minutes" IS NULL AND "eta_max_minutes" IS NULL) OR ("eta_min_minutes" BETWEEN 1 AND ${ETA_MAX_MINUTES} AND "eta_max_minutes" BETWEEN 1 AND ${ETA_MAX_MINUTES} AND "eta_min_minutes" <= "eta_max_minutes")`,
      ),
    ),
    check("orders_created_at_utc", utcCheck("created_at")),
    check("orders_updated_at_utc", utcCheck("updated_at")),
  ],
);

export const orderLines = sqliteTable(
  "order_lines",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    position: integer("position").notNull(),
    menuItemId: text("menu_item_id"),
    itemName: text("item_name").notNull(),
    /** Preço unitário com Complementos e Adicionais, no momento da compra. */
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    /** JSON `OrderComplementSnapshot[]` de @foode/shared/order. */
    complements: text("complements").notNull().default("[]"),
    /** JSON `OrderAdditionalSnapshot[]` de @foode/shared/order. */
    additionals: text("additionals").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "order_lines_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }).onDelete("cascade"),
    uniqueIndex("order_lines_order_position_unique").on(
      table.storeId,
      table.orderId,
      table.position,
    ),
    check("order_lines_position", sql.raw(`"position" >= 0`)),
    check(
      "order_lines_item_name",
      sql.raw(`length(trim("item_name")) BETWEEN 1 AND ${MENU_NAME_MAX}`),
    ),
    check("order_lines_unit_price_cents", centsCheck("unit_price_cents")),
    check("order_lines_quantity", sql.raw(`"quantity" BETWEEN 1 AND ${ORDER_LINE_QUANTITY_MAX}`)),
    check("order_lines_total", sql.raw(`"line_total_cents" = "unit_price_cents" * "quantity"`)),
    check("order_lines_complements_json", jsonArrayCheck("complements")),
    check("order_lines_additionals_json", jsonArrayCheck("additionals")),
    check("order_lines_created_at_utc", utcCheck("created_at")),
  ],
);

export const orderStatusEvents = sqliteTable(
  "order_status_events",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    orderId: text("order_id").notNull(),
    fromStatus: text("from_status", { enum: ORDER_STATUSES }),
    toStatus: text("to_status", { enum: ORDER_STATUSES }).notNull(),
    actorUserId: text("actor_user_id").references(() => users.id),
    actorRole: text("actor_role", { enum: PAUSE_ROLES }),
    occurredAt: text("occurred_at").notNull().default(utcNowDefault),
  },
  (table) => [
    foreignKey({
      name: "order_status_events_order_fk",
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }).onDelete("cascade"),
    index("order_status_events_order_idx").on(table.storeId, table.orderId, table.occurredAt),
    check(
      "order_status_events_from_status",
      sql.raw(`"from_status" IS NULL OR ${inList("from_status", ORDER_STATUSES)}`),
    ),
    check("order_status_events_to_status", sql.raw(inList("to_status", ORDER_STATUSES))),
    check(
      "order_status_events_actor",
      sql.raw(
        `("actor_user_id" IS NULL AND "actor_role" IS NULL) OR ("actor_user_id" IS NOT NULL AND ${inList("actor_role", PAUSE_ROLES)})`,
      ),
    ),
    check("order_status_events_occurred_at_utc", utcCheck("occurred_at")),
  ],
);

export const phoneLookups = sqliteTable(
  "phone_lookups",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    occurredAt: text("occurred_at").notNull().default(utcNowDefault),
    /** SHA-256 hex do IP truncado (com sal do servidor); nunca o IP nem o telefone. */
    ipHash: text("ip_hash").notNull(),
    result: text("result", { enum: PHONE_LOOKUP_RESULTS }).notNull(),
    /** Pedido mais recente do telefone na MESMA Loja (só com `found`). */
    matchedOrderId: text("matched_order_id"),
    /** SHA-256 hex do token do "Sou eu" (uso único, vence em `confirm_expires_at`). */
    confirmTokenHash: text("confirm_token_hash"),
    confirmExpiresAt: text("confirm_expires_at"),
    confirmedAt: text("confirmed_at"),
  },
  (table) => [
    foreignKey({
      name: "phone_lookups_order_fk",
      columns: [table.storeId, table.matchedOrderId],
      foreignColumns: [orders.storeId, orders.id],
    }),
    uniqueIndex("phone_lookups_confirm_token_unique").on(table.confirmTokenHash),
    index("phone_lookups_ip_idx").on(table.ipHash, table.occurredAt),
    index("phone_lookups_store_idx").on(table.storeId, table.occurredAt),
    check("phone_lookups_ip_hash", hexHashCheck("ip_hash")),
    check("phone_lookups_result", sql.raw(inList("result", PHONE_LOOKUP_RESULTS))),
    check(
      "phone_lookups_found",
      sql.raw(
        `("result" = 'found' AND "matched_order_id" IS NOT NULL AND "confirm_token_hash" IS NOT NULL AND "confirm_expires_at" IS NOT NULL) OR ("result" <> 'found' AND "matched_order_id" IS NULL AND "confirm_token_hash" IS NULL AND "confirm_expires_at" IS NULL AND "confirmed_at" IS NULL)`,
      ),
    ),
    check(
      "phone_lookups_confirm_token_hash",
      sql.raw(
        `"confirm_token_hash" IS NULL OR (length("confirm_token_hash") = 64 AND lower("confirm_token_hash") = "confirm_token_hash")`,
      ),
    ),
    check("phone_lookups_occurred_at_utc", utcCheck("occurred_at")),
    check(
      "phone_lookups_confirm_expires_at_utc",
      sql.raw(
        `"confirm_expires_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "confirm_expires_at") IS "confirm_expires_at"`,
      ),
    ),
    check(
      "phone_lookups_confirmed_at_utc",
      sql.raw(
        `"confirmed_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "confirmed_at") IS "confirmed_at"`,
      ),
    ),
  ],
);

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;
export type OrderStatusEventRow = typeof orderStatusEvents.$inferSelect;
export type PhoneLookupRow = typeof phoneLookups.$inferSelect;
