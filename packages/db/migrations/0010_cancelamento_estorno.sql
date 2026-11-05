CREATE TABLE `ledger_entry_payouts` (
	`ledger_entry_id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`paid_out_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ledger_entry_payouts_paid_out_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "paid_out_at") IS "paid_out_at"),
	CONSTRAINT "ledger_entry_payouts_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE INDEX `ledger_entry_payouts_store_idx` ON `ledger_entry_payouts` (`store_id`,`paid_out_at`);--> statement-breakpoint
CREATE TABLE `ledger_reversals` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`refund_id` text NOT NULL,
	`kind` text NOT NULL,
	`charged_cents` integer NOT NULL,
	`order_total_cents` integer NOT NULL,
	`service_fee_cents` integer NOT NULL,
	`foode_fee_cents` integer NOT NULL,
	`net_cents` integer NOT NULL,
	`expected_payout_date` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ledger_reversals_kind" CHECK("kind" IN ('annulment', 'compensated_debit')),
	CONSTRAINT "ledger_reversals_charged_cents" CHECK("charged_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "ledger_reversals_order_total_cents" CHECK("order_total_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "ledger_reversals_service_fee_cents" CHECK("service_fee_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "ledger_reversals_foode_fee_cents" CHECK("foode_fee_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "ledger_reversals_sums" CHECK("charged_cents" = "order_total_cents" + "service_fee_cents" AND "foode_fee_cents" <= "order_total_cents" AND "net_cents" = "order_total_cents" - "foode_fee_cents"),
	CONSTRAINT "ledger_reversals_expected_payout_date" CHECK(strftime('%Y-%m-%d', "expected_payout_date") IS "expected_payout_date"),
	CONSTRAINT "ledger_reversals_occurred_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "occurred_at") IS "occurred_at"),
	CONSTRAINT "ledger_reversals_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_reversals_entry_unique` ON `ledger_reversals` (`ledger_entry_id`);--> statement-breakpoint
CREATE INDEX `ledger_reversals_store_payout_idx` ON `ledger_reversals` (`store_id`,`expected_payout_date`);--> statement-breakpoint
CREATE TABLE `order_cancellations` (
	`order_id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`reason` text,
	`actor_user_id` text,
	`actor_role` text,
	`cancelled_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_cancellations_reason" CHECK("reason" IS NULL OR "reason" IN ('item_unavailable', 'no_courier', 'customer_request', 'other', 'pix_expired')),
	CONSTRAINT "order_cancellations_actor" CHECK(("actor_user_id" IS NULL AND "actor_role" IS NULL) OR ("actor_user_id" IS NOT NULL AND "actor_role" IN ('owner', 'operator'))),
	CONSTRAINT "order_cancellations_system_reason" CHECK("reason" IS NOT 'pix_expired' OR "actor_user_id" IS NULL),
	CONSTRAINT "order_cancellations_cancelled_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "cancelled_at") IS "cancelled_at"),
	CONSTRAINT "order_cancellations_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at")
);
--> statement-breakpoint
CREATE INDEX `order_cancellations_store_idx` ON `order_cancellations` (`store_id`,`cancelled_at`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider` text NOT NULL,
	`method` text NOT NULL,
	`card_mode` text,
	`provider_charge_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`service_fee_cents` integer NOT NULL,
	`origin` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`attempt_started_at` text,
	`checked_at` text,
	`last_error_code` text,
	`provider_refund_id` text,
	`requested_at` text,
	`succeeded_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`intent_id`) REFERENCES `payment_intents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`,`order_id`) REFERENCES `orders`(`store_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "refunds_provider" CHECK("provider" IN ('abacatepay', 'efi')),
	CONSTRAINT "refunds_method" CHECK("method" IN ('pix', 'credit')),
	CONSTRAINT "refunds_card_mode" CHECK("card_mode" IS NULL OR "card_mode" IN ('normal', 'rapido')),
	CONSTRAINT "refunds_origin" CHECK("origin" IN ('order_cancelled', 'late_payment', 'orphan_charge')),
	CONSTRAINT "refunds_state" CHECK("state" IN ('pending', 'requested', 'succeeded', 'failed')),
	CONSTRAINT "refunds_idempotency_key" CHECK(length("idempotency_key") BETWEEN 1 AND 80),
	CONSTRAINT "refunds_provider_charge_id" CHECK(length("provider_charge_id") BETWEEN 1 AND 200),
	CONSTRAINT "refunds_amount_cents" CHECK("amount_cents" BETWEEN 1 AND 100000000),
	CONSTRAINT "refunds_service_fee_cents" CHECK("service_fee_cents" BETWEEN 0 AND 100000000),
	CONSTRAINT "refunds_service_fee_lt_amount" CHECK("service_fee_cents" < "amount_cents"),
	CONSTRAINT "refunds_attempts" CHECK("attempts" >= 0),
	CONSTRAINT "refunds_last_error_code" CHECK("last_error_code" IS NULL OR length("last_error_code") BETWEEN 1 AND 80),
	CONSTRAINT "refunds_provider_refund_id" CHECK("provider_refund_id" IS NULL OR length("provider_refund_id") BETWEEN 1 AND 200),
	CONSTRAINT "refunds_succeeded_at" CHECK(("state" = 'succeeded') = ("succeeded_at" IS NOT NULL)),
	CONSTRAINT "refunds_next_attempt_at_utc" CHECK("next_attempt_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "next_attempt_at") IS "next_attempt_at"),
	CONSTRAINT "refunds_attempt_started_at_utc" CHECK("attempt_started_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "attempt_started_at") IS "attempt_started_at"),
	CONSTRAINT "refunds_checked_at_utc" CHECK("checked_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "checked_at") IS "checked_at"),
	CONSTRAINT "refunds_requested_at_utc" CHECK("requested_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "requested_at") IS "requested_at"),
	CONSTRAINT "refunds_succeeded_at_utc" CHECK("succeeded_at" IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', "succeeded_at") IS "succeeded_at"),
	CONSTRAINT "refunds_created_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "created_at") IS "created_at"),
	CONSTRAINT "refunds_updated_at_utc" CHECK(strftime('%Y-%m-%dT%H:%M:%fZ', "updated_at") IS "updated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_intent_unique` ON `refunds` (`intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_idempotency_unique` ON `refunds` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `refunds_store_order_idx` ON `refunds` (`store_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `refunds_state_next_idx` ON `refunds` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `refunds_provider_charge_idx` ON `refunds` (`provider`,`provider_charge_id`);