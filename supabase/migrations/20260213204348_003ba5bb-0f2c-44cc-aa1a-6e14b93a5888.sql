
-- Add contractor-reported issues fields to bookings table
ALTER TABLE public.bookings
ADD COLUMN contractor_issues jsonb DEFAULT NULL,
ADD COLUMN contractor_issue_notes text DEFAULT NULL,
ADD COLUMN contractor_issue_photos text[] DEFAULT NULL;

-- Add new booking status value for issue-reported completions
-- The booking_status enum already exists, we need to add the new value
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'completed_with_issues';
