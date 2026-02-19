
-- Add completed_at to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Add new booking status value
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'completed_pending_verification';

-- Create job_photos table
CREATE TABLE public.job_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id),
  photo_type text NOT NULL CHECK (photo_type IN ('before', 'after')),
  photo_url text NOT NULL,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  exif_timestamp timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;

-- Contractors can insert photos for their assigned bookings
CREATE POLICY "Contractors can insert photos for their bookings"
ON public.job_photos
FOR INSERT
WITH CHECK (
  contractor_id IN (
    SELECT c.id FROM contractors c WHERE c.user_id = auth.uid()
  )
  AND booking_id IN (
    SELECT b.id FROM bookings b
    JOIN contractors c ON b.contractor_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- Contractors can view photos for their bookings
CREATE POLICY "Contractors can view their booking photos"
ON public.job_photos
FOR SELECT
USING (
  contractor_id IN (
    SELECT c.id FROM contractors c WHERE c.user_id = auth.uid()
  )
);

-- Customers can view photos for their bookings
CREATE POLICY "Customers can view photos for their bookings"
ON public.job_photos
FOR SELECT
USING (
  booking_id IN (
    SELECT b.id FROM bookings b WHERE b.user_id = auth.uid()
  )
);

-- Admins can view all photos
CREATE POLICY "Admins can view all photos"
ON public.job_photos
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for job photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for job-photos bucket
CREATE POLICY "Contractors can upload job photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'job-photos'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can view job photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'job-photos'
  AND auth.role() = 'authenticated'
);
