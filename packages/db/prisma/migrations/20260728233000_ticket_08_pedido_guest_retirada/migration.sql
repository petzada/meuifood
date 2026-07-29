ALTER TABLE "stores"
    ADD COLUMN "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "contact_phone_e164" TEXT;

ALTER TABLE "stores"
    ADD CONSTRAINT "stores_contact_phone_e164_format_check"
    CHECK (
        "contact_phone_e164" IS NULL
        OR "contact_phone_e164" ~ '^55[1-9][0-9]9[0-9]{8}$'
    );

CREATE TYPE "order_status" AS ENUM (
    'received',
    'preparing',
    'ready_for_pickup',
    'completed',
    'cancelled'
);

CREATE TYPE "fulfillment_type" AS ENUM ('pickup');

CREATE TYPE "payment_method" AS ENUM ('on_delivery');

CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "public_code" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'received',
    "fulfillment_type" "fulfillment_type" NOT NULL,
    "payment_method" "payment_method" NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_phone_e164" TEXT NOT NULL,
    "customer_user_id" UUID,
    "items_total_cents" INTEGER NOT NULL,
    "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "idempotency_payload_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_public_code_format_check"
        CHECK ("public_code" ~ '^[A-Z0-9]{6}$'),
    CONSTRAINT "orders_access_token_format_check"
        CHECK (char_length("access_token") >= 32),
    CONSTRAINT "orders_guest_name_check"
        CHECK (char_length(btrim("guest_name")) BETWEEN 1 AND 120),
    CONSTRAINT "orders_guest_phone_e164_format_check"
        CHECK ("guest_phone_e164" ~ '^55[1-9][0-9]9[0-9]{8}$'),
    CONSTRAINT "orders_items_total_cents_check"
        CHECK ("items_total_cents" >= 0),
    CONSTRAINT "orders_delivery_fee_cents_check"
        CHECK ("delivery_fee_cents" >= 0),
    CONSTRAINT "orders_total_cents_check"
        CHECK ("total_cents" >= 0),
    CONSTRAINT "orders_total_matches_parts_check"
        CHECK ("total_cents" = "items_total_cents" + "delivery_fee_cents"),
    CONSTRAINT "orders_idempotency_key_check"
        CHECK (char_length(btrim("idempotency_key")) BETWEEN 8 AND 128),
    CONSTRAINT "orders_idempotency_payload_hash_check"
        CHECK ("idempotency_payload_hash" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "orders_access_token_key" ON "orders"("access_token");
CREATE UNIQUE INDEX "orders_store_id_id_key" ON "orders"("store_id", "id");
CREATE UNIQUE INDEX "orders_store_id_idempotency_key_key"
    ON "orders"("store_id", "idempotency_key");
CREATE UNIQUE INDEX "orders_store_id_public_code_key"
    ON "orders"("store_id", "public_code");
CREATE INDEX "orders_store_id_created_at_idx"
    ON "orders"("store_id", "created_at" DESC);
CREATE INDEX "orders_store_id_status_created_at_idx"
    ON "orders"("store_id", "status", "created_at" DESC);

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "order_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "menu_item_id" UUID,
    "item_name" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "complement_snapshots" JSONB NOT NULL,
    "additional_snapshots" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_lines_sort_order_check"
        CHECK ("sort_order" >= 0),
    CONSTRAINT "order_lines_item_name_check"
        CHECK (char_length(btrim("item_name")) BETWEEN 1 AND 160),
    CONSTRAINT "order_lines_unit_price_cents_check"
        CHECK ("unit_price_cents" >= 0),
    CONSTRAINT "order_lines_quantity_check"
        CHECK ("quantity" BETWEEN 1 AND 99),
    CONSTRAINT "order_lines_line_total_cents_check"
        CHECK ("line_total_cents" >= 0),
    CONSTRAINT "order_lines_line_total_matches_check"
        CHECK ("line_total_cents" = "unit_price_cents" * "quantity"),
    CONSTRAINT "order_lines_complement_snapshots_array_check"
        CHECK (jsonb_typeof("complement_snapshots") = 'array'),
    CONSTRAINT "order_lines_additional_snapshots_array_check"
        CHECK (jsonb_typeof("additional_snapshots") = 'array')
);

CREATE INDEX "order_lines_store_id_order_id_sort_order_idx"
    ON "order_lines"("store_id", "order_id", "sort_order");
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");

ALTER TABLE "order_lines"
    ADD CONSTRAINT "order_lines_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_lines"
    ADD CONSTRAINT "order_lines_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_lines"
    ADD CONSTRAINT "order_lines_store_id_order_id_fkey"
    FOREIGN KEY ("store_id", "order_id") REFERENCES "orders"("store_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE "orders", "order_lines"
    TO foode_business;

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "orders_tenant_isolation"
    ON "orders"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );
CREATE POLICY "orders_public_access_token_lookup"
    ON "orders"
    FOR SELECT TO foode_business
    USING (
        "access_token" = NULLIF(current_setting('app.public_order_access_token', true), '')
    );

ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "order_lines_tenant_isolation"
    ON "order_lines"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );
