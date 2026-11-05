CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price_cents" INTEGER NOT NULL,
    "image_object_key" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "menu_items_price_cents_nonnegative_check" CHECK ("price_cents" >= 0)
);

CREATE INDEX "menu_categories_store_id_sort_order_idx"
    ON "menu_categories"("store_id", "sort_order");
CREATE INDEX "menu_items_store_id_category_id_idx"
    ON "menu_items"("store_id", "category_id");

ALTER TABLE "menu_categories"
    ADD CONSTRAINT "menu_categories_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_items"
    ADD CONSTRAINT "menu_items_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_items"
    ADD CONSTRAINT "menu_items_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "menu_categories", "menu_items" TO foode_business;

ALTER TABLE "menu_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menu_categories_tenant_isolation" ON "menu_categories"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );

ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menu_items_tenant_isolation" ON "menu_items"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );

CREATE POLICY "stores_public_slug_lookup" ON "stores"
    FOR SELECT TO foode_business
    USING (
        "slug" = NULLIF(current_setting('app.public_slug', true), '')
    );
