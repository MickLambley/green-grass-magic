-- Drop existing policies that need updating
DROP POLICY IF EXISTS "Contractors can view available jobs" ON public.bookings;
DROP POLICY IF EXISTS "Contractors can accept available jobs" ON public.bookings;

-- Recreate policy: Contractors can view available jobs
-- If preferred_contractor_id is set, only that contractor can see it
CREATE POLICY "Contractors can view available jobs"
ON public.bookings
FOR SELECT
USING (
  contractor_id IS NULL
  AND payment_status = 'paid'
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM contractors c
    WHERE c.user_id = auth.uid()
      AND c.is_active = true
      AND c.approval_status = 'approved'
  )
  -- If preferred_contractor_id is set, only that contractor can see it
  AND (
    preferred_contractor_id IS NULL
    OR preferred_contractor_id IN (
      SELECT c.id FROM contractors c WHERE c.user_id = auth.uid()
    )
  )
);

-- Recreate policy: Contractors can accept available jobs
-- If preferred_contractor_id is set, only that contractor can accept it
CREATE POLICY "Contractors can accept available jobs"
ON public.bookings
FOR UPDATE
USING (
  contractor_id IS NULL
  AND payment_status = 'paid'
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM contractors c
    WHERE c.user_id = auth.uid()
      AND c.is_active = true
      AND c.approval_status = 'approved'
  )
  -- If preferred_contractor_id is set, only that contractor can accept it
  AND (
    preferred_contractor_id IS NULL
    OR preferred_contractor_id IN (
      SELECT c.id FROM contractors c WHERE c.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  contractor_id IN (
    SELECT c.id FROM contractors c
    WHERE c.user_id = auth.uid()
  )
  AND status IN ('pending', 'confirmed')
);