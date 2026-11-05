CREATE TABLE `delivery_neighborhoods` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`fee_cents` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "delivery_neighborhoods_name" CHECK(length(trim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "delivery_neighborhoods_normalized_name" CHECK(length("normalized_name") BETWEEN 1 AND 120),
	CONSTRAINT "delivery_neighborhoods_fee_cents" CHECK("fee_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "delivery_neighborhoods_active_bool" CHECK("active" IN (0, 1)),
	CONSTRAINT "delivery_neighborhoods_position" CHECK("position" >= 0),
	CONSTRAINT "delivery_neighborhoods_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "delivery_neighborhoods_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_neighborhoods_store_id_unique` ON `delivery_neighborhoods` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_neighborhoods_store_name_unique` ON `delivery_neighborhoods` (`store_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `delivery_neighborhoods_store_position_idx` ON `delivery_neighborhoods` (`store_id`,`position`);--> statement-breakpoint
CREATE TABLE `store_opening_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`opens_at` text NOT NULL,
	`closes_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_opening_periods_weekday" CHECK("weekday" BETWEEN 1 AND 7),
	CONSTRAINT "store_opening_periods_opens_at" CHECK(strftime('%H:%M', "opens_at") IS "opens_at"),
	CONSTRAINT "store_opening_periods_closes_at" CHECK(strftime('%H:%M', "closes_at") IS "closes_at"),
	CONSTRAINT "store_opening_periods_order" CHECK("opens_at" < "closes_at"),
	CONSTRAINT "store_opening_periods_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_opening_periods_store_day_open_unique` ON `store_opening_periods` (`store_id`,`weekday`,`opens_at`);--> statement-breakpoint
CREATE TABLE `store_operation_settings` (
	`store_id` text PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`paused_at` text,
	`paused_by_user_id` text,
	`paused_by_role` text,
	`pickup_enabled` integer DEFAULT false NOT NULL,
	`delivery_mode` text,
	`delivery_fixed_fee_cents` integer,
	`delivery_minimum_order_cents` integer,
	`delivery_eta_min_minutes` integer,
	`delivery_eta_max_minutes` integer,
	`pickup_eta_min_minutes` integer,
	`pickup_eta_max_minutes` integer,
	`debit_brands` text DEFAULT '[]' NOT NULL,
	`credit_brands` text DEFAULT '[]' NOT NULL,
	`print_on_accept` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paused_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_operation_settings_paused_bool" CHECK("paused" IN (0, 1)),
	CONSTRAINT "store_operation_settings_pause_actor" CHECK(("paused" = 0 AND "paused_at" IS NULL AND "paused_by_user_id" IS NULL AND "paused_by_role" IS NULL) OR ("paused" = 1 AND "paused_at" IS NOT NULL AND "paused_by_user_id" IS NOT NULL AND "paused_by_role" IS NOT NULL)),
	CONSTRAINT "store_operation_settings_paused_by_role" CHECK("paused_by_role" IS NULL OR "paused_by_role" IN ('owner', 'operator')),
	CONSTRAINT "store_operation_settings_paused_at_utc" CHECK("paused_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "paused_at") IS "paused_at"),
	CONSTRAINT "store_operation_settings_pickup_bool" CHECK("pickup_enabled" IN (0, 1)),
	CONSTRAINT "store_operation_settings_delivery_mode" CHECK("delivery_mode" IS NULL OR "delivery_mode" IN ('neighborhood', 'fixed')),
	CONSTRAINT "store_operation_settings_fixed_fee" CHECK(("delivery_fixed_fee_cents" IS NULL OR "delivery_fixed_fee_cents" BETWEEN 0 AND 100000000) AND ("delivery_mode" IS NOT 'fixed' OR "delivery_fixed_fee_cents" IS NOT NULL)),
	CONSTRAINT "store_operation_settings_minimum_order" CHECK("delivery_minimum_order_cents" IS NULL OR "delivery_minimum_order_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "store_operation_settings_delivery_eta" CHECK(("delivery_eta_min_minutes" IS NULL AND "delivery_eta_max_minutes" IS NULL) OR ("delivery_eta_min_minutes" BETWEEN 1 AND 240 AND "delivery_eta_max_minutes" BETWEEN 1 AND 240 AND "delivery_eta_min_minutes" <= "delivery_eta_max_minutes")),
	CONSTRAINT "store_operation_settings_pickup_eta" CHECK(("pickup_eta_min_minutes" IS NULL AND "pickup_eta_max_minutes" IS NULL) OR ("pickup_eta_min_minutes" BETWEEN 1 AND 240 AND "pickup_eta_max_minutes" BETWEEN 1 AND 240 AND "pickup_eta_min_minutes" <= "pickup_eta_max_minutes")),
	CONSTRAINT "store_operation_settings_debit_brands" CHECK(json_valid("debit_brands") AND json_type("debit_brands") = 'array'),
	CONSTRAINT "store_operation_settings_credit_brands" CHECK(json_valid("credit_brands") AND json_type("credit_brands") = 'array'),
	CONSTRAINT "store_operation_settings_print_bool" CHECK("print_on_accept" IN (0, 1)),
	CONSTRAINT "store_operation_settings_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "store_operation_settings_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`position` integer NOT NULL,
	`menu_item_id` text,
	`item_name` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	`complements` text DEFAULT '[]' NOT NULL,
	`additionals` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_lines_position" CHECK("position" >= 0),
	CONSTRAINT "order_lines_item_name" CHECK(length(trim("item_name")) BETWEEN 1 AND 120),
	CONSTRAINT "order_lines_unit_price_cents" CHECK("unit_price_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "order_lines_quantity" CHECK("quantity" BETWEEN 1 AND 99),
	CONSTRAINT "order_lines_total" CHECK("line_total_cents" = "unit_price_cents" * "quantity"),
	CONSTRAINT "order_lines_complements_json" CHECK(json_valid("complements") AND json_type("complements") = 'array'),
	CONSTRAINT "order_lines_additionals_json" CHECK(json_valid("additionals") AND json_type("additionals") = 'array'),
	CONSTRAINT "order_lines_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_lines_order_position_unique` ON `order_lines` (`store_id`,`order_id`,`position`);--> statement-breakpoint
CREATE TABLE `order_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_user_id` text,
	`actor_role` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_status_events_from_status" CHECK("from_status" IS NULL OR "from_status" IN ('received', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled')),
	CONSTRAINT "order_status_events_to_status" CHECK("to_status" IN ('received', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled')),
	CONSTRAINT "order_status_events_actor" CHECK(("actor_user_id" IS NULL AND "actor_role" IS NULL) OR ("actor_user_id" IS NOT NULL AND "actor_role" IN ('owner', 'operator'))),
	CONSTRAINT "order_status_events_occurred_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "occurred_at") IS "occurred_at")
);
--> statement-breakpoint
CREATE INDEX `order_status_events_order_idx` ON `order_status_events` (`store_id`,`order_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`code` integer NOT NULL,
	`access_token_hash` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`idempotency_payload_hash` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`fulfillment` text NOT NULL,
	`payment_method` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone_e164` text NOT NULL,
	`delivery_postal_code` text,
	`delivery_street` text,
	`delivery_number` text,
	`delivery_complement` text,
	`delivery_reference` text,
	`delivery_neighborhood` text,
	`delivery_fee_mode` text,
	`items_subtotal_cents` integer NOT NULL,
	`delivery_fee_cents` integer DEFAULT 0 NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`change_for_cents` integer,
	`note` text,
	`eta_min_minutes` integer,
	`eta_max_minutes` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_code" CHECK("code" >= 1),
	CONSTRAINT "orders_access_token_hash" CHECK(length("access_token_hash") = 64 AND lower("access_token_hash") = "access_token_hash"),
	CONSTRAINT "orders_idempotency_key" CHECK(length("idempotency_key") = 36),
	CONSTRAINT "orders_idempotency_payload_hash" CHECK(length("idempotency_payload_hash") = 64 AND lower("idempotency_payload_hash") = "idempotency_payload_hash"),
	CONSTRAINT "orders_status" CHECK("status" IN ('received', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled')),
	CONSTRAINT "orders_fulfillment" CHECK("fulfillment" IN ('delivery', 'pickup')),
	CONSTRAINT "orders_payment_method" CHECK("payment_method" IN ('pix', 'credit', 'on_delivery')),
	CONSTRAINT "orders_status_fulfillment" CHECK(NOT ("fulfillment" = 'delivery' AND "status" = 'ready_for_pickup') AND NOT ("fulfillment" = 'pickup' AND "status" = 'out_for_delivery')),
	CONSTRAINT "orders_customer_name" CHECK(length(trim("customer_name")) BETWEEN 1 AND 120),
	CONSTRAINT "orders_customer_phone" CHECK(length("customer_phone_e164") = 13),
	CONSTRAINT "orders_delivery_postal_code" CHECK("delivery_postal_code" IS NULL OR length("delivery_postal_code") = 8),
	CONSTRAINT "orders_delivery_street" CHECK("delivery_street" IS NULL OR length("delivery_street") BETWEEN 1 AND 200),
	CONSTRAINT "orders_delivery_number" CHECK("delivery_number" IS NULL OR length("delivery_number") BETWEEN 1 AND 20),
	CONSTRAINT "orders_delivery_complement" CHECK("delivery_complement" IS NULL OR length("delivery_complement") BETWEEN 1 AND 120),
	CONSTRAINT "orders_delivery_reference" CHECK("delivery_reference" IS NULL OR length("delivery_reference") BETWEEN 1 AND 160),
	CONSTRAINT "orders_delivery_neighborhood" CHECK("delivery_neighborhood" IS NULL OR length("delivery_neighborhood") BETWEEN 1 AND 120),
	CONSTRAINT "orders_delivery_fee_mode" CHECK("delivery_fee_mode" IS NULL OR "delivery_fee_mode" IN ('neighborhood', 'fixed')),
	CONSTRAINT "orders_address_by_fulfillment" CHECK(("fulfillment" = 'delivery' AND "delivery_street" IS NOT NULL AND "delivery_number" IS NOT NULL AND "delivery_neighborhood" IS NOT NULL AND "delivery_fee_mode" IS NOT NULL) OR ("fulfillment" = 'pickup' AND "delivery_postal_code" IS NULL AND "delivery_street" IS NULL AND "delivery_number" IS NULL AND "delivery_complement" IS NULL AND "delivery_reference" IS NULL AND "delivery_neighborhood" IS NULL AND "delivery_fee_mode" IS NULL AND "delivery_fee_cents" = 0)),
	CONSTRAINT "orders_items_subtotal_cents" CHECK("items_subtotal_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "orders_delivery_fee_cents" CHECK("delivery_fee_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "orders_discount_cents" CHECK("discount_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "orders_total_cents" CHECK("total_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "orders_total_sum" CHECK("discount_cents" <= "items_subtotal_cents" + "delivery_fee_cents" AND "total_cents" = "items_subtotal_cents" + "delivery_fee_cents" - "discount_cents"),
	CONSTRAINT "orders_change_for" CHECK("change_for_cents" IS NULL OR ("payment_method" = 'on_delivery' AND "change_for_cents" >= "total_cents" AND "change_for_cents" <= 100000000)),
	CONSTRAINT "orders_note" CHECK("note" IS NULL OR length("note") BETWEEN 1 AND 200),
	CONSTRAINT "orders_eta" CHECK(("eta_min_minutes" IS NULL AND "eta_max_minutes" IS NULL) OR ("eta_min_minutes" BETWEEN 1 AND 240 AND "eta_max_minutes" BETWEEN 1 AND 240 AND "eta_min_minutes" <= "eta_max_minutes")),
	CONSTRAINT "orders_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "orders_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_id_unique` ON `orders` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_code_unique` ON `orders` (`store_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_idempotency_unique` ON `orders` (`store_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_access_token_hash_unique` ON `orders` (`access_token_hash`);--> statement-breakpoint
CREATE INDEX `orders_store_status_created_idx` ON `orders` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_created_idx` ON `orders` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_phone_created_idx` ON `orders` (`store_id`,`customer_phone_e164`,`created_at`);--> statement-breakpoint
CREATE TABLE `phone_lookups` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`ip_hash` text NOT NULL,
	`result` text NOT NULL,
	`matched_order_id` text,
	`confirm_token_hash` text,
	`confirm_expires_at` text,
	`confirmed_at` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`matched_order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "phone_lookups_ip_hash" CHECK(length("ip_hash") = 64 AND lower("ip_hash") = "ip_hash"),
	CONSTRAINT "phone_lookups_result" CHECK("result" IN ('found', 'not_found', 'rate_limited', 'captcha_failed')),
	CONSTRAINT "phone_lookups_found" CHECK(("result" = 'found' AND "matched_order_id" IS NOT NULL AND "confirm_token_hash" IS NOT NULL AND "confirm_expires_at" IS NOT NULL) OR ("result" <> 'found' AND "matched_order_id" IS NULL AND "confirm_token_hash" IS NULL AND "confirm_expires_at" IS NULL AND "confirmed_at" IS NULL)),
	CONSTRAINT "phone_lookups_confirm_token_hash" CHECK("confirm_token_hash" IS NULL OR (length("confirm_token_hash") = 64 AND lower("confirm_token_hash") = "confirm_token_hash")),
	CONSTRAINT "phone_lookups_occurred_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "occurred_at") IS "occurred_at"),
	CONSTRAINT "phone_lookups_confirm_expires_at_utc" CHECK("confirm_expires_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "confirm_expires_at") IS "confirm_expires_at"),
	CONSTRAINT "phone_lookups_confirmed_at_utc" CHECK("confirmed_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "confirmed_at") IS "confirmed_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phone_lookups_confirm_token_unique` ON `phone_lookups` (`confirm_token_hash`);--> statement-breakpoint
CREATE INDEX `phone_lookups_ip_idx` ON `phone_lookups` (`ip_hash`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `phone_lookups_store_idx` ON `phone_lookups` (`store_id`,`occurred_at`);