-- Allow contractors to view profiles for customers of their active (non-completed) assigned bookings
CREATE POLICY "Contractors can view customer profiles for active bookings"
ON public.profiles
FOR SELECT
USING (
  user_id IN (
    SELECT b.user_id 
    FROM bookings b
    JOIN contractors c ON b.contractor_id = c.id
    WHERE c.user_id = auth.uid()
      AND b.status IN ('confirmed', 'pending')
  )
);