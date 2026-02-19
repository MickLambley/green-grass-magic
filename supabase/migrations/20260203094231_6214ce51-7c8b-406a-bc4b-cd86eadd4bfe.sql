-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;

-- Allow admins to insert any notification
CREATE POLICY "Admins can insert any notification"
ON public.notifications
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Contractors can only insert notifications for users who have bookings assigned to them
CREATE POLICY "Contractors can notify their customers"
ON public.notifications
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'contractor'::app_role)
  AND user_id IN (
    SELECT DISTINCT b.user_id 
    FROM bookings b
    JOIN contractors c ON c.id = b.contractor_id
    WHERE c.user_id = auth.uid()
  )
);

-- Users can only insert notifications for contractors who have their bookings
CREATE POLICY "Users can notify their contractors"
ON public.notifications
FOR INSERT
WITH CHECK (
  user_id IN (
    SELECT DISTINCT c.user_id 
    FROM bookings b
    JOIN contractors c ON c.id = b.contractor_id
    WHERE b.user_id = auth.uid()
  )
);