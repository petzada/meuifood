CREATE TYPE "billing_mode" AS ENUM ('pilot_platform', 'baas', 'merchant_own_account');
CREATE TYPE "membership_role" AS ENUM ('owner', 'operator');

CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "billing_mode" "billing_mode" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stores_tax_id_format_check" CHECK ("tax_id" ~ '^[0-9]{14}$')
);

CREATE TABLE "store_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stores_tax_id_key" ON "stores"("tax_id");
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");
CREATE UNIQUE INDEX "stores_single_pilot_platform_idx"
    ON "stores"("billing_mode")
    WHERE "billing_mode" = 'pilot_platform';
CREATE UNIQUE INDEX "store_members_store_id_user_id_key"
    ON "store_members"("store_id", "user_id");
CREATE INDEX "store_members_user_id_idx" ON "store_members"("user_id");

ALTER TABLE "store_members"
    ADD CONSTRAINT "store_members_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'foode_business') THEN
        CREATE ROLE foode_business
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO foode_business;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "stores", "store_members" TO foode_business;

ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stores" FORCE ROW LEVEL SECURITY;
CREATE POLICY "stores_tenant_isolation" ON "stores"
    FOR ALL TO foode_business
    USING (
        "id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );

ALTER TABLE "store_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY "store_members_tenant_isolation" ON "store_members"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );
