-- Allow contractors to view addresses for available (unassigned, paid, pending) bookings
CREATE POLICY "Contractors can view addresses for available jobs"
ON public.addresses
FOR SELECT
USING (
  id IN (
    SELECT b.address_id
    FROM bookings b
    WHERE b.contractor_id IS NULL
      AND b.payment_status = 'paid'
      AND b.status = 'pending'
  )
  AND EXISTS (
    SELECT 1 FROM contractors c
    WHERE c.user_id = auth.uid()
      AND c.is_active = true
      AND c.approval_status = 'approved'
  )
);