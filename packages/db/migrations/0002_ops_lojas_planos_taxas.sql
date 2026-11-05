CREATE TABLE `payment_fees` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text,
	`method` text NOT NULL,
	`card_mode` text,
	`percent_bps` integer NOT NULL,
	`fixed_cents` integer DEFAULT 0 NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_fees_method" CHECK("method" IN ('pix', 'credit')),
	CONSTRAINT "payment_fees_card_mode" CHECK(("method" = 'credit' AND "card_mode" IN ('normal', 'rapido')) OR ("method" = 'pix' AND "card_mode" IS NULL)),
	CONSTRAINT "payment_fees_percent_bps" CHECK("percent_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "payment_fees_fixed_cents" CHECK("fixed_cents" >= 0),
	CONSTRAINT "payment_fees_period" CHECK("valid_to" IS NULL OR "valid_to" > "valid_from"),
	CONSTRAINT "payment_fees_valid_from_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "valid_from") IS "valid_from"),
	CONSTRAINT "payment_fees_valid_to_utc" CHECK("valid_to" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "valid_to") IS "valid_to"),
	CONSTRAINT "payment_fees_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE INDEX `payment_fees_lookup_idx` ON `payment_fees` (`store_id`,`method`,`card_mode`,`valid_from`);--> statement-breakpoint
CREATE TABLE `plan_price_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle` text NOT NULL,
	`min_orders` integer NOT NULL,
	`max_orders` integer,
	`price_cents` integer NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_price_tiers_cycle" CHECK("cycle" IN ('monthly', 'annual')),
	CONSTRAINT "plan_price_tiers_min_orders" CHECK("min_orders" >= 0),
	CONSTRAINT "plan_price_tiers_max_orders" CHECK("max_orders" IS NULL OR "max_orders" >= "min_orders"),
	CONSTRAINT "plan_price_tiers_annual_unlimited" CHECK("cycle" <> 'annual' OR ("min_orders" = 0 AND "max_orders" IS NULL)),
	CONSTRAINT "plan_price_tiers_price_cents" CHECK("price_cents" >= 0),
	CONSTRAINT "plan_price_tiers_period" CHECK("valid_to" IS NULL OR "valid_to" > "valid_from"),
	CONSTRAINT "plan_price_tiers_valid_from_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "valid_from") IS "valid_from"),
	CONSTRAINT "plan_price_tiers_valid_to_utc" CHECK("valid_to" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "valid_to") IS "valid_to"),
	CONSTRAINT "plan_price_tiers_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE INDEX `plan_price_tiers_valid_from_idx` ON `plan_price_tiers` (`valid_from`,`cycle`,`min_orders`);--> statement-breakpoint
CREATE TABLE `provider_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`operation` text NOT NULL,
	`percent_bps` integer NOT NULL,
	`fixed_cents` integer DEFAULT 0 NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "provider_costs_provider" CHECK("provider" IN ('abacatepay', 'efi')),
	CONSTRAINT "provider_costs_operation" CHECK("operation" IN ('pix_charge', 'card_charge', 'pix_payout')),
	CONSTRAINT "provider_costs_efi_no_pix_charge" CHECK(NOT ("provider" = 'efi' AND "operation" = 'pix_charge')),
	CONSTRAINT "provider_costs_percent_bps" CHECK("percent_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "provider_costs_fixed_cents" CHECK("fixed_cents" >= 0),
	CONSTRAINT "provider_costs_period" CHECK("valid_to" IS NULL OR "valid_to" > "valid_from"),
	CONSTRAINT "provider_costs_valid_from_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "valid_from") IS "valid_from"),
	CONSTRAINT "provider_costs_valid_to_utc" CHECK("valid_to" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "valid_to") IS "valid_to"),
	CONSTRAINT "provider_costs_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE INDEX `provider_costs_lookup_idx` ON `provider_costs` (`provider`,`operation`,`valid_from`);--> statement-breakpoint
CREATE TABLE `store_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`cycle` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_plans_cycle" CHECK("cycle" IN ('monthly', 'annual')),
	CONSTRAINT "store_plans_period" CHECK("valid_to" IS NULL OR "valid_to" > "valid_from"),
	CONSTRAINT "store_plans_valid_from_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "valid_from") IS "valid_from"),
	CONSTRAINT "store_plans_valid_to_utc" CHECK("valid_to" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "valid_to") IS "valid_to"),
	CONSTRAINT "store_plans_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE INDEX `store_plans_store_idx` ON `store_plans` (`store_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `store_profiles` (
	`store_id` text PRIMARY KEY NOT NULL,
	`cnpj` text NOT NULL,
	`whatsapp` text NOT NULL,
	`address_postal_code` text NOT NULL,
	`address_street` text NOT NULL,
	`address_number` text NOT NULL,
	`address_complement` text,
	`address_district` text NOT NULL,
	`address_city` text NOT NULL,
	`address_state` text NOT NULL,
	`payout_pix_key_type` text NOT NULL,
	`payout_pix_key` text NOT NULL,
	`payout_holder_name` text NOT NULL,
	`payout_holder_document` text NOT NULL,
	`card_mode` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_profiles_cnpj_length" CHECK(length("cnpj") = 14),
	CONSTRAINT "store_profiles_whatsapp_length" CHECK(length("whatsapp") = 13),
	CONSTRAINT "store_profiles_postal_code_length" CHECK(length("address_postal_code") = 8),
	CONSTRAINT "store_profiles_state_length" CHECK(length("address_state") = 2),
	CONSTRAINT "store_profiles_pix_key_type" CHECK("payout_pix_key_type" IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
	CONSTRAINT "store_profiles_pix_key_not_blank" CHECK(length(trim("payout_pix_key")) > 0),
	CONSTRAINT "store_profiles_holder_name_not_blank" CHECK(length(trim("payout_holder_name")) > 0),
	CONSTRAINT "store_profiles_holder_document_length" CHECK(length("payout_holder_document") IN (11, 14)),
	CONSTRAINT "store_profiles_card_mode" CHECK("card_mode" IS NULL OR "card_mode" IN ('normal', 'rapido')),
	CONSTRAINT "store_profiles_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "store_profiles_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE INDEX `store_profiles_cnpj_idx` ON `store_profiles` (`cnpj`);--> statement-breakpoint
-- Seed da decisão 61 (faixas Anota −15%) e dos custos atuais dos provedores (Ticket 29): 9 linhas
-- em tabelas recém-criadas (não é backfill). Ids fixos; o teste de contrato da api confere estes
-- valores contra PLAN_TIERS_SEED e PROVIDER_COSTS_SEED de @foode/shared/ops.
-- A taxa Foode (`payment_fees`) nasce vazia (decisão 61).
INSERT OR IGNORE INTO `plan_price_tiers` (`id`, `cycle`, `min_orders`, `max_orders`, `price_cents`, `valid_from`) VALUES
	('00000000-0000-4000-8000-000000000101', 'monthly', 0, 150, 8499, '2026-11-01T00:00:00.000Z'),
	('00000000-0000-4000-8000-000000000102', 'monthly', 151, 250, 16999, '2026-11-01T00:00:00.000Z'),
	('00000000-0000-4000-8000-000000000103', 'monthly', 251, NULL, 25499, '2026-11-01T00:00:00.000Z'),
	('00000000-0000-4000-8000-000000000104', 'annual', 0, NULL, 101988, '2026-11-01T00:00:00.000Z');--> statement-breakpoint
INSERT OR IGNORE INTO `provider_costs` (`id`, `provider`, `operation`, `percent_bps`, `fixed_cents`, `valid_from`) VALUES
	('00000000-0000-4000-8000-000000000201', 'abacatepay', 'pix_charge', 0, 54, '2026-11-01T00:00:00.000Z'),
	('00000000-0000-4000-8000-000000000202', 'abacatepay', 'pix_payout', 0, 80, '2026-11-01T00:00:00.000Z'),
	('00000000-0000-4000-8000-000000000203', 'abacatepay', 'card_charge', 542, 60, '2026-11-01T00:00:00.000Z'),
	('00000000-0000-4000-8000-000000000204', 'efi', 'card_charge', 349, 0, '2026-11-01T00:00:00.000Z'),
	('00000000-0000-4000-8000-000000000205', 'efi', 'pix_payout', 119, 0, '2026-11-01T00:00:00.000Z');