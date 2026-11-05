CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`whatsapp` text NOT NULL,
	`store_name` text NOT NULL,
	`city` text NOT NULL,
	`orders_per_day` text NOT NULL,
	`source` text,
	`status` text DEFAULT 'new' NOT NULL,
	`status_changed_at` text,
	`status_changed_by_user_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`status_changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "leads_name_length" CHECK(length(trim("name")) BETWEEN 2 AND 80),
	CONSTRAINT "leads_whatsapp_length" CHECK(length("whatsapp") = 13),
	CONSTRAINT "leads_store_name_length" CHECK(length(trim("store_name")) BETWEEN 2 AND 80),
	CONSTRAINT "leads_city_length" CHECK(length(trim("city")) BETWEEN 2 AND 60),
	CONSTRAINT "leads_source_length" CHECK("source" IS NULL OR length("source") BETWEEN 1 AND 120),
	CONSTRAINT "leads_orders_per_day" CHECK("orders_per_day" IN ('ate_10', '10_a_50', 'mais_de_50')),
	CONSTRAINT "leads_status" CHECK("status" IN ('new', 'contacted', 'converted', 'discarded')),
	CONSTRAINT "leads_status_changed_at_utc" CHECK("status_changed_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "status_changed_at") IS "status_changed_at"),
	CONSTRAINT "leads_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "leads_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE INDEX `leads_created_idx` ON `leads` (`created_at`);--> statement-breakpoint
CREATE INDEX `leads_status_created_idx` ON `leads` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `store_operation_settings` ADD `delivery_rate_per_km_cents` integer;