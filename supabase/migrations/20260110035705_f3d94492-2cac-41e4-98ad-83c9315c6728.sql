-- Fix the notifications INSERT policy to be more restrictive
-- Drop the overly permissive policy
DROP POLICY "System can insert notifications" ON public.notifications;

-- Create a policy that allows admins/contractors to insert notifications
-- and allows the edge function (via service role) to insert
CREATE POLICY "Admins can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contractor'::app_role));