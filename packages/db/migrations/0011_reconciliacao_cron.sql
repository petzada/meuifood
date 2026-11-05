-- Ticket 15 (reconciliação por Cron Trigger). Só expand: duas tabelas novas e uma coluna
-- nullable. O drizzle-kit gera recriação de `order_cancellations` para o CHECK novo; aqui ela vira
-- ADD COLUMN com o mesmo CHECK (o SQLite confere o CHECK nas linhas existentes, todas com NULL).
-- O snapshot 0011 descreve o mesmo schema, então `migrations:check` não vê divergência.
CREATE TABLE `ledger_release_confirmations` (
	`ledger_entry_id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_status` text NOT NULL,
	`release_date` text NOT NULL,
	`expected_payout_date` text NOT NULL,
	`previous_release_date` text NOT NULL,
	`previous_expected_payout_date` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ledger_release_confirmations_provider" CHECK("provider" IN ('abacatepay', 'efi')),
	CONSTRAINT "ledger_release_confirmations_provider_status" CHECK(length("provider_status") BETWEEN 1 AND 40),
	CONSTRAINT "ledger_release_confirmations_release_date" CHECK(strftime('%Y-%m-%d', "release_date") IS "release_date"),
	CONSTRAINT "ledger_release_confirmations_expected_payout_date" CHECK(strftime('%Y-%m-%d', "expected_payout_date") IS "expected_payout_date"),
	CONSTRAINT "ledger_release_confirmations_payout_after_release" CHECK("expected_payout_date" > "release_date"),
	CONSTRAINT "ledger_release_confirmations_previous_release_date" CHECK(strftime('%Y-%m-%d', "previous_release_date") IS "previous_release_date"),
	CONSTRAINT "ledger_release_confirmations_previous_expected_payout_date" CHECK(strftime('%Y-%m-%d', "previous_expected_payout_date") IS "previous_expected_payout_date"),
	CONSTRAINT "ledger_release_confirmations_confirmed_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "confirmed_at") IS "confirmed_at"),
	CONSTRAINT "ledger_release_confirmations_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE INDEX `ledger_release_confirmations_store_idx` ON `ledger_release_confirmations` (`store_id`,`expected_payout_date`);--> statement-breakpoint
CREATE TABLE `maintenance_locks` (
	`name` text PRIMARY KEY NOT NULL,
	`holder` text,
	`locked_until` text,
	`acquired_at` text,
	`last_finished_at` text,
	`last_summary` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "maintenance_locks_name" CHECK("name" IN ('payments', 'settlement')),
	CONSTRAINT "maintenance_locks_holder" CHECK(("holder" IS NULL) = ("locked_until" IS NULL)),
	CONSTRAINT "maintenance_locks_locked_until_utc" CHECK("locked_until" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "locked_until") IS "locked_until"),
	CONSTRAINT "maintenance_locks_acquired_at_utc" CHECK("acquired_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "acquired_at") IS "acquired_at"),
	CONSTRAINT "maintenance_locks_last_finished_at_utc" CHECK("last_finished_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "last_finished_at") IS "last_finished_at"),
	CONSTRAINT "maintenance_locks_last_summary" CHECK("last_summary" IS NULL OR length("last_summary") BETWEEN 2 AND 4000),
	CONSTRAINT "maintenance_locks_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
ALTER TABLE `order_cancellations` ADD `system_reason` text CONSTRAINT "order_cancellations_system_reason_only" CHECK("system_reason" IS NULL OR ("system_reason" IN ('card_abandoned') AND "reason" IS NULL AND "actor_user_id" IS NULL));
