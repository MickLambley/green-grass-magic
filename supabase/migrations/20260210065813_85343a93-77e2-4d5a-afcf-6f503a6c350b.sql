
-- Add contractor_tier enum
CREATE TYPE public.contractor_tier AS ENUM ('probation', 'standard', 'premium');

-- Add tier column to contractors table with default 'probation'
ALTER TABLE public.contractors
ADD COLUMN tier public.contractor_tier NOT NULL DEFAULT 'probation';
