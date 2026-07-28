ALTER TABLE "stores"
    ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "store_operating_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "opens_at" CHAR(5) NOT NULL,
    "closes_at" CHAR(5) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_operating_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_operating_periods_weekday_check"
        CHECK ("weekday" BETWEEN 1 AND 7),
    CONSTRAINT "store_operating_periods_opens_at_format_check"
        CHECK ("opens_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "store_operating_periods_closes_at_format_check"
        CHECK ("closes_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "store_operating_periods_same_day_order_check"
        CHECK ("opens_at" < "closes_at")
);

CREATE UNIQUE INDEX "store_operating_periods_store_id_weekday_opens_at_closes_at_key"
    ON "store_operating_periods"("store_id", "weekday", "opens_at", "closes_at");
CREATE INDEX "store_operating_periods_store_id_weekday_opens_at_idx"
    ON "store_operating_periods"("store_id", "weekday", "opens_at");

ALTER TABLE "store_operating_periods"
    ADD CONSTRAINT "store_operating_periods_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE "store_operating_periods"
    TO foode_business;

ALTER TABLE "store_operating_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_operating_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY "store_operating_periods_tenant_isolation"
    ON "store_operating_periods"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );
