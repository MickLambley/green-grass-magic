
-- Update contractor view policy to show bookings with saved payment method (pending status)
DROP POLICY IF EXISTS "Contractors can view available jobs" ON public.bookings;
CREATE POLICY "Contractors can view available jobs"
ON public.bookings
FOR SELECT
USING (
  (contractor_id IS NULL)
  AND (payment_status = 'pending')
  AND (payment_method_id IS NOT NULL)
  AND (status = 'pending'::booking_status)
  AND (EXISTS (
    SELECT 1 FROM contractors c
    WHERE c.user_id = auth.uid()
      AND c.is_active = true
      AND c.approval_status = 'approved'
  ))
  AND (
    (preferred_contractor_id IS NULL)
    OR (preferred_contractor_id IN (
      SELECT c.id FROM contractors c WHERE c.user_id = auth.uid()
    ))
  )
);

-- Update contractor accept policy to match new payment_status
DROP POLICY IF EXISTS "Contractors can accept available jobs" ON public.bookings;
CREATE POLICY "Contractors can accept available jobs"
ON public.bookings
FOR UPDATE
USING (
  (contractor_id IS NULL)
  AND (payment_status = 'pending')
  AND (payment_method_id IS NOT NULL)
  AND (status = 'pending'::booking_status)
  AND (EXISTS (
    SELECT 1 FROM contractors c
    WHERE c.user_id = auth.uid()
      AND c.is_active = true
      AND c.approval_status = 'approved'
  ))
  AND (
    (preferred_contractor_id IS NULL)
    OR (preferred_contractor_id IN (
      SELECT c.id FROM contractors c WHERE c.user_id = auth.uid()
    ))
  )
)
WITH CHECK (
  (contractor_id IN (
    SELECT c.id FROM contractors c WHERE c.user_id = auth.uid()
  ))
  AND (status = ANY (ARRAY['pending'::booking_status, 'confirmed'::booking_status]))
);

-- Update contractor address view policy to match
DROP POLICY IF EXISTS "Contractors can view addresses for available jobs" ON public.addresses;
CREATE POLICY "Contractors can view addresses for available jobs"
ON public.addresses
FOR SELECT
USING (
  (id IN (
    SELECT b.address_id FROM bookings b
    WHERE b.contractor_id IS NULL
      AND b.payment_status = 'pending'
      AND b.payment_method_id IS NOT NULL
      AND b.status = 'pending'::booking_status
  ))
  AND (EXISTS (
    SELECT 1 FROM contractors c
    WHERE c.user_id = auth.uid()
      AND c.is_active = true
      AND c.approval_status = 'approved'
  ))
);
