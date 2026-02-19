-- Add policy requiring authentication to view contractors
-- This prevents anonymous access to contractor phone numbers and business names
CREATE POLICY "Authenticated users can view active contractors"
ON public.contractors
FOR SELECT
TO authenticated
USING (is_active = true);

-- Note: This is a PERMISSIVE policy that allows authenticated users to see active contractors
-- which is needed for the booking flow where users select a preferred contractor