CREATE TABLE `menu_additionals` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`item_id` text NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`item_id`) REFERENCES `menu_items`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "menu_additionals_name" CHECK(length(trim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "menu_additionals_price_cents" CHECK("price_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "menu_additionals_available_bool" CHECK("available" IN (0, 1)),
	CONSTRAINT "menu_additionals_position" CHECK("position" >= 0),
	CONSTRAINT "menu_additionals_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "menu_additionals_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE INDEX `menu_additionals_item_position_idx` ON `menu_additionals` (`store_id`,`item_id`,`position`);--> statement-breakpoint
CREATE TABLE `menu_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "menu_categories_name" CHECK(length(trim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "menu_categories_position" CHECK("position" >= 0),
	CONSTRAINT "menu_categories_available_bool" CHECK("available" IN (0, 1)),
	CONSTRAINT "menu_categories_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "menu_categories_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_categories_store_id_unique` ON `menu_categories` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `menu_categories_store_position_idx` ON `menu_categories` (`store_id`,`position`);--> statement-breakpoint
CREATE TABLE `menu_complement_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`item_id` text NOT NULL,
	`name` text NOT NULL,
	`min_select` integer DEFAULT 0 NOT NULL,
	`max_select` integer DEFAULT 1 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`item_id`) REFERENCES `menu_items`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "menu_complement_groups_name" CHECK(length(trim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "menu_complement_groups_select_bounds" CHECK("min_select" >= 0 AND "max_select" BETWEEN 1 AND 40 AND "min_select" <= "max_select"),
	CONSTRAINT "menu_complement_groups_position" CHECK("position" >= 0),
	CONSTRAINT "menu_complement_groups_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "menu_complement_groups_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_complement_groups_store_id_unique` ON `menu_complement_groups` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `menu_complement_groups_item_position_idx` ON `menu_complement_groups` (`store_id`,`item_id`,`position`);--> statement-breakpoint
CREATE TABLE `menu_complement_options` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`group_id`) REFERENCES `menu_complement_groups`(`store_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "menu_complement_options_name" CHECK(length(trim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "menu_complement_options_price_cents" CHECK("price_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "menu_complement_options_position" CHECK("position" >= 0),
	CONSTRAINT "menu_complement_options_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "menu_complement_options_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE INDEX `menu_complement_options_group_position_idx` ON `menu_complement_options` (`store_id`,`group_id`,`position`);--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price_cents` integer NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`image_object_key` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`category_id`) REFERENCES `menu_categories`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "menu_items_name" CHECK(length(trim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "menu_items_description" CHECK(length("description") <= 600),
	CONSTRAINT "menu_items_price_cents" CHECK("price_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "menu_items_available_bool" CHECK("available" IN (0, 1)),
	CONSTRAINT "menu_items_featured_bool" CHECK("featured" IN (0, 1)),
	CONSTRAINT "menu_items_image_key_store" CHECK("image_object_key" IS NULL OR (length("image_object_key") <= 200 AND substr("image_object_key", 1, length('stores/' || "store_id" || '/menu/')) = 'stores/' || "store_id" || '/menu/')),
	CONSTRAINT "menu_items_position" CHECK("position" >= 0),
	CONSTRAINT "menu_items_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "menu_items_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_items_store_id_unique` ON `menu_items` (`store_id`,`id`);--> statement-breakpoint
CREATE INDEX `menu_items_category_position_idx` ON `menu_items` (`store_id`,`category_id`,`position`);--> statement-breakpoint
CREATE INDEX `menu_items_store_featured_idx` ON `menu_items` (`store_id`,`featured`);