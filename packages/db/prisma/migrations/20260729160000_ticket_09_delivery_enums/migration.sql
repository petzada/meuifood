-- Ticket 09: novos valores de enum em migration isolada.
-- Postgres só permite USAR o valor após o COMMIT desta migration.
ALTER TYPE "fulfillment_type" ADD VALUE IF NOT EXISTS 'delivery';
ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'out_for_delivery';

CREATE TYPE "delivery_fee_mode" AS ENUM ('fixed', 'neighborhood');

GRANT USAGE ON TYPE "delivery_fee_mode" TO foode_business;
