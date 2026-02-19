-- Drop the existing unique constraint on (booking_id, contractor_id)
ALTER TABLE public.alternative_suggestions DROP CONSTRAINT IF EXISTS alternative_suggestions_booking_id_contractor_id_key;

-- Add new unique constraint on (booking_id, suggested_date, suggested_time_slot)
-- This allows same contractor to suggest multiple times, but prevents duplicate date/time combinations
ALTER TABLE public.alternative_suggestions ADD CONSTRAINT alternative_suggestions_booking_date_time_key 
UNIQUE (booking_id, suggested_date, suggested_time_slot);