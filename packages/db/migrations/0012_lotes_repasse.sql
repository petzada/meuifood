CREATE TABLE `payout_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`reason` text NOT NULL,
	`related_batch_id` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`related_batch_id`) REFERENCES `payout_batches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payout_adjustments_amount_cents" CHECK("amount_cents" BETWEEN -100000000 AND 100000000),
	CONSTRAINT "payout_adjustments_amount_not_zero" CHECK("amount_cents" <> 0),
	CONSTRAINT "payout_adjustments_reason" CHECK(length(trim("reason")) BETWEEN 3 AND 200),
	CONSTRAINT "payout_adjustments_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE INDEX `payout_adjustments_store_idx` ON `payout_adjustments` (`store_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payout_batch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`store_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`batch_id`) REFERENCES `payout_batches`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payout_batch_items_kind" CHECK("kind" IN ('entry', 'retention', 'debit', 'adjustment')),
	CONSTRAINT "payout_batch_items_amount_cents" CHECK("amount_cents" BETWEEN -100000000 AND 100000000),
	CONSTRAINT "payout_batch_items_sign" CHECK(("kind" IN ('entry', 'retention') AND "amount_cents" >= 0) OR ("kind" = 'debit' AND "amount_cents" < 0) OR ("kind" = 'adjustment' AND "amount_cents" <> 0)),
	CONSTRAINT "payout_batch_items_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payout_batch_items_item_unique` ON `payout_batch_items` (`kind`,`item_id`);--> statement-breakpoint
CREATE INDEX `payout_batch_items_batch_idx` ON `payout_batch_items` (`batch_id`);--> statement-breakpoint
CREATE TABLE `payout_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`payout_date` text NOT NULL,
	`paid_on` text NOT NULL,
	`source_account` text NOT NULL,
	`reference` text NOT NULL,
	`transfer_cost_cents` integer NOT NULL,
	`entries_cents` integer NOT NULL,
	`debits_cents` integer NOT NULL,
	`adjustments_cents` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`item_count` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payout_batches_payout_date" CHECK(strftime('%Y-%m-%d', "payout_date") IS "payout_date"),
	CONSTRAINT "payout_batches_paid_on" CHECK(strftime('%Y-%m-%d', "paid_on") IS "paid_on"),
	CONSTRAINT "payout_batches_paid_after_cut" CHECK("paid_on" >= "payout_date"),
	CONSTRAINT "payout_batches_source_account" CHECK("source_account" IN ('efi', 'abacatepay')),
	CONSTRAINT "payout_batches_reference" CHECK(length(trim("reference")) BETWEEN 1 AND 120),
	CONSTRAINT "payout_batches_transfer_cost_cents" CHECK("transfer_cost_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "payout_batches_entries_cents" CHECK("entries_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "payout_batches_debits_cents" CHECK("debits_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "payout_batches_adjustments_cents" CHECK("adjustments_cents" BETWEEN -100000000 AND 100000000),
	CONSTRAINT "payout_batches_amount_cents" CHECK("amount_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "payout_batches_sums" CHECK("amount_cents" = "entries_cents" - "debits_cents" + "adjustments_cents"),
	CONSTRAINT "payout_batches_item_count" CHECK("item_count" >= 1),
	CONSTRAINT "payout_batches_idempotency_key" CHECK(length("idempotency_key") = 36),
	CONSTRAINT "payout_batches_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payout_batches_store_id_unique` ON `payout_batches` (`store_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payout_batches_idempotency_unique` ON `payout_batches` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payout_batches_store_paid_on_idx` ON `payout_batches` (`store_id`,`paid_on`);--> statement-breakpoint
CREATE INDEX `payout_batches_paid_on_idx` ON `payout_batches` (`paid_on`);