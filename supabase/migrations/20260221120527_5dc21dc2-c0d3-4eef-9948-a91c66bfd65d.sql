-- Allow contractors to view bookings where they are the preferred contractor
CREATE POLICY "Contractors can view preferred bookings"
ON public.bookings
FOR SELECT
USING (
  preferred_contractor_id IN (
    SELECT id FROM contractors WHERE user_id = auth.uid()
  )
);

-- Allow contractors to update bookings where they are the preferred contractor (to accept/decline)
CREATE POLICY "Contractors can update preferred bookings"
ON public.bookings
FOR UPDATE
USING (
  preferred_contractor_id IN (
    SELECT id FROM contractors WHERE user_id = auth.uid()
  )
);

-- Allow contractors to view addresses for bookings where they are the preferred contractor
CREATE POLICY "Contractors can view addresses for preferred bookings"
ON public.addresses
FOR SELECT
USING (
  id IN (
    SELECT b.address_id FROM bookings b
    WHERE b.preferred_contractor_id IN (
      SELECT c.id FROM contractors c WHERE c.user_id = auth.uid()
    )
  )
);