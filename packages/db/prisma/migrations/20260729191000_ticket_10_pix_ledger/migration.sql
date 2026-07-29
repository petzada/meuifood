-- Ticket 10: payment_status no Pedido + cobrança + eventos + Ledger (RLS).

ALTER TABLE "orders"
    ADD COLUMN "payment_status" "payment_status" NOT NULL DEFAULT 'not_required';

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_payment_status_by_method_check"
    CHECK (
        (
            "payment_method"::text = 'on_delivery'
            AND "payment_status"::text = 'not_required'
        )
        OR (
            "payment_method"::text = 'pix'
            AND "payment_status"::text IN ('awaiting_payment', 'paid')
        )
    );

CREATE TABLE "payment_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "provider_charge_id" TEXT,
    "status" "charge_status" NOT NULL DEFAULT 'pending',
    "amount_cents" INTEGER NOT NULL,
    "br_code" TEXT,
    "qr_code_image" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_charges_amount_cents_check"
        CHECK ("amount_cents" > 0),
    CONSTRAINT "payment_charges_correlation_id_check"
        CHECK (char_length(btrim("correlation_id")) BETWEEN 8 AND 200)
);

CREATE UNIQUE INDEX "payment_charges_order_id_key"
    ON "payment_charges"("order_id");
CREATE UNIQUE INDEX "payment_charges_correlation_id_key"
    ON "payment_charges"("correlation_id");
CREATE UNIQUE INDEX "payment_charges_store_id_id_key"
    ON "payment_charges"("store_id", "id");
CREATE UNIQUE INDEX "payment_charges_store_id_order_id_key"
    ON "payment_charges"("store_id", "order_id");
CREATE INDEX "payment_charges_store_id_status_created_at_idx"
    ON "payment_charges"("store_id", "status", "created_at" DESC);

ALTER TABLE "payment_charges"
    ADD CONSTRAINT "payment_charges_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_charges"
    ADD CONSTRAINT "payment_charges_store_id_order_id_fkey"
    FOREIGN KEY ("store_id", "order_id") REFERENCES "orders"("store_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "charge_id" UUID,
    "provider" "payment_provider" NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_events_provider_event_id_check"
        CHECK (char_length(btrim("provider_event_id")) BETWEEN 8 AND 400),
    CONSTRAINT "payment_events_event_type_check"
        CHECK (char_length(btrim("event_type")) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX "payment_events_provider_provider_event_id_key"
    ON "payment_events"("provider", "provider_event_id");
CREATE INDEX "payment_events_store_id_created_at_idx"
    ON "payment_events"("store_id", "created_at" DESC);

ALTER TABLE "payment_events"
    ADD CONSTRAINT "payment_events_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_events"
    ADD CONSTRAINT "payment_events_store_id_charge_id_fkey"
    FOREIGN KEY ("store_id", "charge_id") REFERENCES "payment_charges"("store_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "expected_payout_at" DATE NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ledger_entries_gross_cents_check"
        CHECK ("gross_cents" > 0),
    CONSTRAINT "ledger_entries_fee_bps_check"
        CHECK ("fee_bps" >= 0),
    CONSTRAINT "ledger_entries_fee_cents_check"
        CHECK ("fee_cents" >= 0),
    CONSTRAINT "ledger_entries_net_cents_check"
        CHECK ("net_cents" >= 0 AND "net_cents" = "gross_cents" - "fee_cents")
);

CREATE UNIQUE INDEX "ledger_entries_order_id_key"
    ON "ledger_entries"("order_id");
CREATE UNIQUE INDEX "ledger_entries_charge_id_key"
    ON "ledger_entries"("charge_id");
CREATE UNIQUE INDEX "ledger_entries_store_id_id_key"
    ON "ledger_entries"("store_id", "id");
CREATE UNIQUE INDEX "ledger_entries_store_id_order_id_key"
    ON "ledger_entries"("store_id", "order_id");
CREATE UNIQUE INDEX "ledger_entries_store_id_charge_id_key"
    ON "ledger_entries"("store_id", "charge_id");
CREATE INDEX "ledger_entries_store_id_expected_payout_at_idx"
    ON "ledger_entries"("store_id", "expected_payout_at");
CREATE INDEX "ledger_entries_store_id_paid_at_idx"
    ON "ledger_entries"("store_id", "paid_at");

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_store_id_order_id_fkey"
    FOREIGN KEY ("store_id", "order_id") REFERENCES "orders"("store_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_store_id_charge_id_fkey"
    FOREIGN KEY ("store_id", "charge_id") REFERENCES "payment_charges"("store_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_charges" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "payment_charges_tenant_isolation"
    ON "payment_charges"
    FOR ALL
    TO foode_business
    USING ("store_id" = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    WITH CHECK ("store_id" = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

-- Lookup pontual do webhook por correlationID (sem expor listagem cross-tenant).
CREATE POLICY "payment_charges_webhook_correlation_lookup"
    ON "payment_charges"
    FOR SELECT
    TO foode_business
    USING (
        "correlation_id" = NULLIF(current_setting('app.webhook_correlation_id', true), '')
    );

CREATE POLICY "payment_events_tenant_isolation"
    ON "payment_events"
    FOR ALL
    TO foode_business
    USING ("store_id" = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    WITH CHECK ("store_id" = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

CREATE POLICY "ledger_entries_tenant_isolation"
    ON "ledger_entries"
    FOR ALL
    TO foode_business
    USING ("store_id" = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    WITH CHECK ("store_id" = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

-- Lookup pontual ops por id (marcar repasse pago).
CREATE POLICY "ledger_entries_ops_id_lookup"
    ON "ledger_entries"
    FOR SELECT
    TO foode_business
    USING (
        "id"::text = NULLIF(current_setting('app.ops_ledger_entry_id', true), '')
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payment_charges" TO foode_business;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payment_events" TO foode_business;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ledger_entries" TO foode_business;
