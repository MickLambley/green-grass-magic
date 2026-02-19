-- Add new booking statuses
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'pending_address_verification';
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'price_change_pending';

-- Add column to bookings for storing original price before admin adjustment
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS original_price numeric DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS price_change_notified_at timestamp with time zone DEFAULT NULL;
