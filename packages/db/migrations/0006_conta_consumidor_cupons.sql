CREATE TABLE `customer_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_e164` text NOT NULL,
	`cpf` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "customer_accounts_phone" CHECK(length("phone_e164") = 13 AND "phone_e164" NOT GLOB '*[^0-9]*'),
	CONSTRAINT "customer_accounts_cpf" CHECK(length("cpf") = 11 AND "cpf" NOT GLOB '*[^0-9]*'),
	CONSTRAINT "customer_accounts_name" CHECK(length(trim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "customer_accounts_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "customer_accounts_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_accounts_phone_unique` ON `customer_accounts` (`phone_e164`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_accounts_cpf_unique` ON `customer_accounts` (`cpf`);--> statement-breakpoint
CREATE TABLE `customer_login_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_key` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	CONSTRAINT "customer_login_codes_phone_key" CHECK(length("phone_key") = 64 AND lower("phone_key") = "phone_key"),
	CONSTRAINT "customer_login_codes_code_hash" CHECK(length("code_hash") = 64 AND lower("code_hash") = "code_hash"),
	CONSTRAINT "customer_login_codes_attempts" CHECK("attempts" BETWEEN 0 AND 5),
	CONSTRAINT "customer_login_codes_window" CHECK("expires_at" > "created_at"),
	CONSTRAINT "customer_login_codes_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "customer_login_codes_expires_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "expires_at") IS "expires_at"),
	CONSTRAINT "customer_login_codes_consumed_at_utc" CHECK("consumed_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "consumed_at") IS "consumed_at")
);
--> statement-breakpoint
CREATE INDEX `customer_login_codes_phone_idx` ON `customer_login_codes` (`phone_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`account_id` text,
	`phone_e164` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `customer_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customer_sessions_token_hash" CHECK(length("token_hash") = 64 AND lower("token_hash") = "token_hash"),
	CONSTRAINT "customer_sessions_phone" CHECK(length("phone_e164") = 13 AND "phone_e164" NOT GLOB '*[^0-9]*'),
	CONSTRAINT "customer_sessions_window" CHECK("expires_at" > "created_at"),
	CONSTRAINT "customer_sessions_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "customer_sessions_expires_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "expires_at") IS "expires_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_sessions_token_unique` ON `customer_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `customer_sessions_account_idx` ON `customer_sessions` (`account_id`);--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`source` text NOT NULL,
	`coupon_id` text,
	`customer_account_id` text,
	`discount_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_account_id`) REFERENCES `customer_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`coupon_id`) REFERENCES `coupons`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "coupon_redemptions_source" CHECK("source" IN ('promo', 'welcome')),
	CONSTRAINT "coupon_redemptions_source_fields" CHECK(("source" = 'promo' AND "coupon_id" IS NOT NULL) OR ("source" = 'welcome' AND "coupon_id" IS NULL AND "customer_account_id" IS NOT NULL)),
	CONSTRAINT "coupon_redemptions_discount_cents" CHECK("discount_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "coupon_redemptions_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_order_unique` ON `coupon_redemptions` (`store_id`,`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_welcome_unique` ON `coupon_redemptions` (`store_id`,`customer_account_id`) WHERE "source" = 'welcome';--> statement-breakpoint
CREATE INDEX `coupon_redemptions_coupon_idx` ON `coupon_redemptions` (`store_id`,`coupon_id`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`percent` integer,
	`amount_cents` integer,
	`max_discount_cents` integer,
	`min_order_cents` integer,
	`starts_on` text,
	`ends_on` text,
	`weekdays` integer DEFAULT 0 NOT NULL,
	`usage_limit` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "coupons_code" CHECK(length("code") BETWEEN 3 AND 20 AND "code" NOT GLOB '*[^A-Z0-9_-]*'),
	CONSTRAINT "coupons_kind" CHECK("kind" IN ('percent', 'fixed')),
	CONSTRAINT "coupons_kind_fields" CHECK(("kind" = 'percent' AND "percent" BETWEEN 1 AND 100 AND "amount_cents" IS NULL) OR ("kind" = 'fixed' AND "amount_cents" BETWEEN 1 AND 100000000 AND "percent" IS NULL AND "max_discount_cents" IS NULL)),
	CONSTRAINT "coupons_max_discount_cents" CHECK("max_discount_cents" IS NULL OR "max_discount_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "coupons_min_order_cents" CHECK("min_order_cents" IS NULL OR "min_order_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "coupons_starts_on" CHECK("starts_on" IS NULL OR date("starts_on") IS "starts_on"),
	CONSTRAINT "coupons_ends_on" CHECK("ends_on" IS NULL OR date("ends_on") IS "ends_on"),
	CONSTRAINT "coupons_period" CHECK("starts_on" IS NULL OR "ends_on" IS NULL OR "starts_on" <= "ends_on"),
	CONSTRAINT "coupons_weekdays" CHECK("weekdays" BETWEEN 0 AND 127),
	CONSTRAINT "coupons_usage_limit" CHECK("usage_limit" IS NULL OR "usage_limit" >= 1),
	CONSTRAINT "coupons_used_count" CHECK("used_count" >= 0 AND ("usage_limit" IS NULL OR "used_count" <= "usage_limit")),
	CONSTRAINT "coupons_active_bool" CHECK("active" IN (0, 1)),
	CONSTRAINT "coupons_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "coupons_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_store_id_unique` ON `coupons` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_store_code_unique` ON `coupons` (`store_id`,`code`);--> statement-breakpoint
CREATE TABLE `store_welcome_coupons` (
	`store_id` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`kind` text NOT NULL,
	`percent` integer,
	`amount_cents` integer,
	`max_discount_cents` integer,
	`min_order_cents` integer,
	`updated_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_welcome_coupons_active_bool" CHECK("active" IN (0, 1)),
	CONSTRAINT "store_welcome_coupons_kind" CHECK("kind" IN ('percent', 'fixed')),
	CONSTRAINT "store_welcome_coupons_kind_fields" CHECK(("kind" = 'percent' AND "percent" BETWEEN 1 AND 100 AND "amount_cents" IS NULL) OR ("kind" = 'fixed' AND "amount_cents" BETWEEN 1 AND 100000000 AND "percent" IS NULL AND "max_discount_cents" IS NULL)),
	CONSTRAINT "store_welcome_coupons_max_discount_cents" CHECK("max_discount_cents" IS NULL OR "max_discount_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "store_welcome_coupons_min_order_cents" CHECK("min_order_cents" IS NULL OR "min_order_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "store_welcome_coupons_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "store_welcome_coupons_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_account_id` text REFERENCES customer_accounts(id);--> statement-breakpoint
CREATE INDEX `orders_store_account_created_idx` ON `orders` (`store_id`,`customer_account_id`,`created_at`);