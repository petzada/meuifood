CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`actor_user_id` text,
	`store_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_events_action_not_blank" CHECK(length(trim("action")) > 0),
	CONSTRAINT "audit_events_metadata_json" CHECK(json_valid("metadata")),
	CONSTRAINT "audit_events_occurred_at_utc" CHECK("occurred_at" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9].[0-9][0-9][0-9]Z')
);
--> statement-breakpoint
CREATE INDEX `audit_events_store_idx` ON `audit_events` (`store_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `store_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_memberships_role" CHECK("role" IN ('owner', 'operator')),
	CONSTRAINT "store_memberships_created_at_utc" CHECK("created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9].[0-9][0-9][0-9]Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_memberships_store_user_unique` ON `store_memberships` (`store_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `store_memberships_user_idx` ON `store_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'onboarding' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "stores_slug_format" CHECK(length("slug") BETWEEN 3 AND 63 AND "slug" NOT GLOB '*[^a-z0-9-]*' AND "slug" NOT GLOB '-*' AND "slug" NOT GLOB '*-'),
	CONSTRAINT "stores_name_not_blank" CHECK(length(trim("name")) > 0),
	CONSTRAINT "stores_status" CHECK("status" IN ('onboarding', 'active', 'suspended')),
	CONSTRAINT "stores_created_at_utc" CHECK("created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9].[0-9][0-9][0-9]Z'),
	CONSTRAINT "stores_updated_at_utc" CHECK("updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9].[0-9][0-9][0-9]Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`platform_role` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK("email" = lower("email") AND "email" LIKE '%_@_%'),
	CONSTRAINT "users_email_verified_bool" CHECK("email_verified" IN (0, 1)),
	CONSTRAINT "users_platform_role" CHECK("platform_role" IS NULL OR "platform_role" IN ('foode_ops')),
	CONSTRAINT "users_created_at_utc" CHECK("created_at" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9].[0-9][0-9][0-9]Z'),
	CONSTRAINT "users_updated_at_utc" CHECK("updated_at" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-6][0-9].[0-9][0-9][0-9]Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);