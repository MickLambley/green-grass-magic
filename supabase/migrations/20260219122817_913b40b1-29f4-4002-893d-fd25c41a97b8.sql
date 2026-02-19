
-- Add website fields to contractors table
ALTER TABLE public.contractors 
  ADD COLUMN IF NOT EXISTS website_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_copy jsonb DEFAULT NULL;
