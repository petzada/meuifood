CREATE TABLE `card_payments` (
	`intent_id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`attempt_key` text NOT NULL,
	`state` text DEFAULT 'processing' NOT NULL,
	`decline_reason` text,
	`provider_status` text,
	`brand` text,
	`last_four` text,
	`efi_notification_token` text,
	`efi_last_event_id` integer,
	`approved_at` text,
	`expected_release_date` text,
	`release_source` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`intent_id`) REFERENCES `payment_intents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "card_payments_attempt_key" CHECK(length("attempt_key") = 36 AND "attempt_key" = lower("attempt_key")),
	CONSTRAINT "card_payments_state" CHECK("state" IN ('processing', 'pending', 'approved', 'declined')),
	CONSTRAINT "card_payments_decline_reason" CHECK(("state" = 'declined' AND "decline_reason" IN ('issuer_declined', 'invalid_payer_data', 'token_expired', 'provider_unavailable', 'unknown')) OR ("state" <> 'declined' AND "decline_reason" IS NULL)),
	CONSTRAINT "card_payments_provider_status" CHECK("provider_status" IS NULL OR length("provider_status") BETWEEN 1 AND 40),
	CONSTRAINT "card_payments_brand" CHECK("brand" IS NULL OR "brand" IN ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'diners', 'other')),
	CONSTRAINT "card_payments_last_four" CHECK("last_four" IS NULL OR "last_four" GLOB '[0-9][0-9][0-9][0-9]'),
	CONSTRAINT "card_payments_efi_notification_token" CHECK("efi_notification_token" IS NULL OR length("efi_notification_token") BETWEEN 8 AND 128),
	CONSTRAINT "card_payments_efi_last_event_id" CHECK("efi_last_event_id" IS NULL OR "efi_last_event_id" >= 0),
	CONSTRAINT "card_payments_approved_at" CHECK(("state" = 'approved') = ("approved_at" IS NOT NULL)),
	CONSTRAINT "card_payments_approved_at_utc" CHECK("approved_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "approved_at") IS "approved_at"),
	CONSTRAINT "card_payments_expected_release_date" CHECK(("expected_release_date" IS NULL AND "release_source" IS NULL) OR (strftime('%Y-%m-%d', "expected_release_date") IS "expected_release_date" AND "release_source" IN ('informed', 'max_term'))),
	CONSTRAINT "card_payments_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "card_payments_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_payments_attempt_unique` ON `card_payments` (`store_id`,`order_id`,`attempt_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_payments_efi_token_unique` ON `card_payments` (`efi_notification_token`) WHERE "efi_notification_token" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `ledger_retentions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`reason` text DEFAULT 'provider_retention' NOT NULL,
	`amount_cents` integer NOT NULL,
	`release_date` text NOT NULL,
	`expected_payout_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ledger_retentions_reason" CHECK("reason" IN ('provider_retention')),
	CONSTRAINT "ledger_retentions_amount_cents" CHECK("amount_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "ledger_retentions_release_date" CHECK(strftime('%Y-%m-%d', "release_date") IS "release_date"),
	CONSTRAINT "ledger_retentions_expected_payout_date" CHECK(strftime('%Y-%m-%d', "expected_payout_date") IS "expected_payout_date"),
	CONSTRAINT "ledger_retentions_payout_after_release" CHECK("expected_payout_date" > "release_date"),
	CONSTRAINT "ledger_retentions_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_retentions_entry_release_unique` ON `ledger_retentions` (`ledger_entry_id`,`release_date`);--> statement-breakpoint
CREATE INDEX `ledger_retentions_store_payout_idx` ON `ledger_retentions` (`store_id`,`expected_payout_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_intents_credit_active_unique` ON `payment_intents` (`store_id`,`order_id`) WHERE "method" = 'credit' AND "state" IN ('creating', 'pending', 'paid');