
-- Add insurance tracking fields to contractors table
ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS insurance_expiry_date date,
ADD COLUMN IF NOT EXISTS insurance_verified boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS insurance_uploaded_at timestamp with time zone;
