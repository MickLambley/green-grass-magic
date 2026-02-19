-- Allow contractors to accept available jobs (update contractor_id and status)
CREATE POLICY "Contractors can accept available jobs"
ON public.bookings
FOR UPDATE
USING (
  -- Job must be unassigned, paid, and pending
  contractor_id IS NULL
  AND payment_status = 'paid'
  AND status = 'pending'
  -- User must be an active, approved contractor
  AND EXISTS (
    SELECT 1 FROM contractors c
    WHERE c.user_id = auth.uid()
      AND c.is_active = true
      AND c.approval_status = 'approved'
  )
)
WITH CHECK (
  -- Only allow setting contractor_id to their own contractor record
  contractor_id IN (
    SELECT c.id FROM contractors c
    WHERE c.user_id = auth.uid()
  )
  AND status IN ('pending', 'confirmed')
);