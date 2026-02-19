
-- Fix 1: Make lawn-images bucket private
UPDATE storage.buckets SET public = false WHERE id = 'lawn-images';

-- Drop the public access policy
DROP POLICY IF EXISTS "Lawn images are publicly accessible" ON storage.objects;

-- Add proper RLS policies for lawn-images bucket

-- Users can view their own lawn images (stored as {userId}/...)
CREATE POLICY "Users can view own lawn images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lawn-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can view all lawn images
CREATE POLICY "Admins can view all lawn images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lawn-images' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Contractors can view lawn images for their confirmed/completed jobs
CREATE POLICY "Contractors view lawn images for their jobs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lawn-images'
  AND (
    -- User-uploaded images (path: {userId}/...)
    EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.addresses a ON a.id = b.address_id
      JOIN public.contractors c ON c.id = b.contractor_id
      WHERE c.user_id = auth.uid()
        AND b.status IN ('confirmed'::booking_status, 'completed'::booking_status)
        AND (storage.foldername(name))[1] = a.user_id::text
    )
    OR
    -- Admin-uploaded images (path: admin/{addressId}/...)
    (
      (storage.foldername(name))[1] = 'admin'
      AND EXISTS (
        SELECT 1
        FROM public.bookings b
        JOIN public.contractors c ON c.id = b.contractor_id
        WHERE c.user_id = auth.uid()
          AND b.status IN ('confirmed'::booking_status, 'completed'::booking_status)
          AND (storage.foldername(name))[2] = b.address_id::text
      )
    )
  )
);
