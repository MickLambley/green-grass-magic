
-- Add quality monitoring columns to contractors
ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS quality_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS quality_reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS suspension_reason text,
ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS suspension_status text NOT NULL DEFAULT 'active';
