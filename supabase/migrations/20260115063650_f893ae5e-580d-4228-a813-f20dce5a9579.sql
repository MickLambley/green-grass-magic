-- Add RLS policy for contractors to view bookings assigned to them
CREATE POLICY "Contractors can view their assigned bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  )
);

-- Add RLS policy for contractors to update their assigned bookings
CREATE POLICY "Contractors can update their assigned bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  )
);

-- Add RLS policy for contractors to view addresses for their assigned bookings
CREATE POLICY "Contractors can view addresses for their bookings"
ON public.addresses
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT b.address_id 
    FROM public.bookings b
    JOIN public.contractors c ON b.contractor_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- Tighten reviews visibility - users can only see their own reviews or reviews about them as contractors
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;

CREATE POLICY "Users can view their own reviews"
ON public.reviews
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);