-- Ticket 10: enums PIX / pagamento / Ledger (valores novos em migration isolada).
-- Postgres só permite USAR o valor após o COMMIT desta migration.

ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'pix';

CREATE TYPE "payment_status" AS ENUM (
    'not_required',
    'awaiting_payment',
    'paid'
);

CREATE TYPE "payment_provider" AS ENUM ('woovi');

CREATE TYPE "charge_status" AS ENUM (
    'pending',
    'active',
    'completed',
    'expired',
    'provider_error'
);

GRANT USAGE ON TYPE "payment_status" TO foode_business;
GRANT USAGE ON TYPE "payment_provider" TO foode_business;
GRANT USAGE ON TYPE "charge_status" TO foode_business;
