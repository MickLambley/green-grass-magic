
-- Fix 1: Tighten contractor profile access to only confirmed/assigned bookings
DROP POLICY IF EXISTS "Contractors can view customer profiles for active bookings" ON public.profiles;

CREATE POLICY "Contractors can view customer profiles for assigned bookings"
ON public.profiles
FOR SELECT
USING (
  user_id IN (
    SELECT b.user_id
    FROM bookings b
    JOIN contractors c ON b.contractor_id = c.id
    WHERE c.user_id = auth.uid()
      AND b.status = 'confirmed'::booking_status
  )
);

-- Fix 2: Add RLS policy to pricing_settings (admin-only access)
-- RLS is already enabled per the scan, but there's an ALL policy for admins.
-- The issue states no RLS policies exist, but the schema shows "Admins can manage pricing settings" ALL policy.
-- Let's verify by ensuring a restrictive SELECT policy exists for non-admins (deny all non-admin reads).
-- The existing ALL policy only grants admin access, which is correct. No additional changes needed for pricing_settings
-- if the ALL policy is working. But to be safe, let's ensure there's no public access by adding an explicit deny.
