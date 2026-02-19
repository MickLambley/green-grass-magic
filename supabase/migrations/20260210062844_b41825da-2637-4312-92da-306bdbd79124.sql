-- Add new payment-related fields to bookings table
-- payment_method_id already doesn't exist, payment_intent_id already exists, payment_status already exists as text

ALTER TABLE public.bookings
ADD COLUMN payment_method_id text,
ADD COLUMN charged_at timestamp with time zone,
ADD COLUMN payout_status text NOT NULL DEFAULT 'pending',
ADD COLUMN payout_released_at timestamp with time zone;
