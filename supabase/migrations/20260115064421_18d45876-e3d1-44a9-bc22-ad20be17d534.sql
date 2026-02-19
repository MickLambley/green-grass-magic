-- Allow contractors to view available (unassigned) paid bookings so they can accept jobs
CREATE POLICY "Contractors can view available jobs"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  -- Unassigned bookings that are paid and pending
  contractor_id IS NULL 
  AND payment_status = 'paid' 
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.contractors 
    WHERE user_id = auth.uid() 
      AND is_active = true
  )
);