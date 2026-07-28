-- Ticket 06: Complementos, Adicionais e base para carrinho single-store.
-- Pedido/snapshots ficam no Ticket 08; estas tabelas não reescrevem histórico.

CREATE TABLE "menu_complement_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_complement_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "menu_complement_groups_sort_order_nonnegative_check"
        CHECK ("sort_order" >= 0)
);

CREATE TABLE "menu_complement_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_complement_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "menu_complement_options_sort_order_nonnegative_check"
        CHECK ("sort_order" >= 0)
);

CREATE TABLE "menu_additionals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_additionals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "menu_additionals_price_cents_nonnegative_check"
        CHECK ("price_cents" >= 0),
    CONSTRAINT "menu_additionals_sort_order_nonnegative_check"
        CHECK ("sort_order" >= 0)
);

CREATE INDEX "menu_complement_groups_store_id_item_id_sort_order_idx"
    ON "menu_complement_groups"("store_id", "item_id", "sort_order");
CREATE INDEX "menu_complement_options_store_id_group_id_sort_order_idx"
    ON "menu_complement_options"("store_id", "group_id", "sort_order");
CREATE INDEX "menu_additionals_store_id_item_id_sort_order_idx"
    ON "menu_additionals"("store_id", "item_id", "sort_order");

ALTER TABLE "menu_items"
    ADD CONSTRAINT "menu_items_store_id_id_key" UNIQUE ("store_id", "id");

ALTER TABLE "menu_complement_groups"
    ADD CONSTRAINT "menu_complement_groups_store_id_id_key"
    UNIQUE ("store_id", "id");

ALTER TABLE "menu_complement_groups"
    ADD CONSTRAINT "menu_complement_groups_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_complement_groups"
    ADD CONSTRAINT "menu_complement_groups_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "menu_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_complement_groups"
    ADD CONSTRAINT "menu_complement_groups_store_item_fkey"
    FOREIGN KEY ("store_id", "item_id") REFERENCES "menu_items"("store_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_complement_options"
    ADD CONSTRAINT "menu_complement_options_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_complement_options"
    ADD CONSTRAINT "menu_complement_options_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "menu_complement_groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_complement_options"
    ADD CONSTRAINT "menu_complement_options_store_group_fkey"
    FOREIGN KEY ("store_id", "group_id")
    REFERENCES "menu_complement_groups"("store_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_additionals"
    ADD CONSTRAINT "menu_additionals_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_additionals"
    ADD CONSTRAINT "menu_additionals_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "menu_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_additionals"
    ADD CONSTRAINT "menu_additionals_store_item_fkey"
    FOREIGN KEY ("store_id", "item_id") REFERENCES "menu_items"("store_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    "menu_complement_groups",
    "menu_complement_options",
    "menu_additionals"
    TO foode_business;

ALTER TABLE "menu_complement_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_complement_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menu_complement_groups_tenant_isolation" ON "menu_complement_groups"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );

ALTER TABLE "menu_complement_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_complement_options" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menu_complement_options_tenant_isolation" ON "menu_complement_options"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );

ALTER TABLE "menu_additionals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_additionals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "menu_additionals_tenant_isolation" ON "menu_additionals"
    FOR ALL TO foode_business
    USING (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    )
    WITH CHECK (
        "store_id" = (SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid)
    );
