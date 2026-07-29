-- Ticket 09: config Delivery (taxa fixa | bairro) + snapshot no Pedido.

ALTER TABLE "stores"
    ADD COLUMN "delivery_fee_mode" "delivery_fee_mode",
    ADD COLUMN "fixed_delivery_fee_cents" INTEGER;

ALTER TABLE "stores"
    ADD CONSTRAINT "stores_fixed_delivery_fee_cents_check"
    CHECK (
        "fixed_delivery_fee_cents" IS NULL
        OR "fixed_delivery_fee_cents" >= 0
    );

ALTER TABLE "stores"
    ADD CONSTRAINT "stores_delivery_fee_mode_fixed_check"
    CHECK (
        "delivery_fee_mode"::text IS DISTINCT FROM 'fixed'
        OR "fixed_delivery_fee_cents" IS NOT NULL
    );

CREATE TABLE "delivery_neighborhoods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_neighborhoods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_neighborhoods_name_check"
        CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "delivery_neighborhoods_normalized_name_check"
        CHECK (char_length(btrim("normalized_name")) BETWEEN 1 AND 120),
    CONSTRAINT "delivery_neighborhoods_fee_cents_check"
        CHECK ("fee_cents" >= 0),
    CONSTRAINT "delivery_neighborhoods_sort_order_check"
        CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX "delivery_neighborhoods_store_id_normalized_name_key"
    ON "delivery_neighborhoods"("store_id", "normalized_name");
CREATE INDEX "delivery_neighborhoods_store_id_sort_order_idx"
    ON "delivery_neighborhoods"("store_id", "sort_order");

ALTER TABLE "delivery_neighborhoods"
    ADD CONSTRAINT "delivery_neighborhoods_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_neighborhoods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_neighborhoods" FORCE ROW LEVEL SECURITY;

CREATE POLICY "delivery_neighborhoods_tenant_isolation"
    ON "delivery_neighborhoods"
    FOR ALL
    TO foode_business
    USING ("store_id" = NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    WITH CHECK ("store_id" = NULLIF(current_setting('app.current_store_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "delivery_neighborhoods" TO foode_business;

ALTER TABLE "orders"
    ADD COLUMN "delivery_street_line" TEXT,
    ADD COLUMN "delivery_neighborhood" TEXT,
    ADD COLUMN "delivery_complement" TEXT,
    ADD COLUMN "delivery_reference" TEXT,
    ADD COLUMN "delivery_fee_mode_snapshot" "delivery_fee_mode";

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_delivery_address_by_fulfillment_check"
    CHECK (
        (
            "fulfillment_type"::text = 'pickup'
            AND "delivery_street_line" IS NULL
            AND "delivery_neighborhood" IS NULL
            AND "delivery_complement" IS NULL
            AND "delivery_reference" IS NULL
            AND "delivery_fee_mode_snapshot" IS NULL
            AND "delivery_fee_cents" = 0
        )
        OR (
            "fulfillment_type"::text = 'delivery'
            AND "delivery_street_line" IS NOT NULL
            AND char_length(btrim("delivery_street_line")) BETWEEN 1 AND 200
            AND "delivery_neighborhood" IS NOT NULL
            AND char_length(btrim("delivery_neighborhood")) BETWEEN 1 AND 120
            AND (
                "delivery_complement" IS NULL
                OR char_length(btrim("delivery_complement")) BETWEEN 1 AND 120
            )
            AND (
                "delivery_reference" IS NULL
                OR char_length(btrim("delivery_reference")) BETWEEN 1 AND 160
            )
            AND "delivery_fee_mode_snapshot" IS NOT NULL
        )
    );
