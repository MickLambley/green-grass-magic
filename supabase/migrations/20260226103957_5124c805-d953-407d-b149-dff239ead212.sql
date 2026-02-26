-- Fix 1: Replace overly permissive dispute-photos SELECT policy
-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Authenticated users can view dispute photos" ON storage.objects;

-- Create a restrictive policy that only allows involved parties
CREATE POLICY "Involved parties can view dispute photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'dispute-photos' AND
    (
      -- Admins can view all
      has_role(auth.uid(), 'admin'::app_role)
      OR
      -- Customer who raised the dispute (via booking)
      EXISTS (
        SELECT 1 FROM disputes d
        JOIN bookings b ON d.booking_id = b.id
        WHERE b.user_id = auth.uid()
        AND (storage.foldername(name))[1] = d.id::text
      )
      OR
      -- Contractor involved in the dispute (via booking)
      EXISTS (
        SELECT 1 FROM disputes d
        JOIN bookings b ON d.booking_id = b.id
        JOIN contractors c ON b.contractor_id = c.id
        WHERE c.user_id = auth.uid()
        AND (storage.foldername(name))[1] = d.id::text
      )
      OR
      -- Customer who raised the dispute (via job)
      EXISTS (
        SELECT 1 FROM disputes d
        JOIN jobs j ON d.job_id = j.id
        WHERE j.customer_user_id = auth.uid()
        AND (storage.foldername(name))[1] = d.id::text
      )
      OR
      -- Contractor involved in the dispute (via job)
      EXISTS (
        SELECT 1 FROM disputes d
        JOIN jobs j ON d.job_id = j.id
        JOIN contractors c ON j.contractor_id = c.id
        WHERE c.user_id = auth.uid()
        AND (storage.foldername(name))[1] = d.id::text
      )
    )
  );

-- Fix 2: Replace overly permissive notifications INSERT policy
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Only allow users to insert notifications for themselves (edge functions use service role to bypass RLS)
CREATE POLICY "Users can insert own notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);