
-- Add original_scheduled_time to jobs table to track pre-shift times
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS original_scheduled_time TEXT;

-- Comment for clarity
COMMENT ON COLUMN public.jobs.original_scheduled_time IS 'Stores the originally requested time before auto-shift conflict resolution moved it';
