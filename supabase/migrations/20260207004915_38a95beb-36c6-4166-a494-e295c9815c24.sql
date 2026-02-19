-- Fix security issues: Restrict pricing_settings, contractors, and reviews access

-- 1. Pricing Settings: Remove public access, keep admin-only
DROP POLICY IF EXISTS "Users can view pricing settings" ON public.pricing_settings;

-- 2. Contractors: Drop the overly permissive policy and create a restricted one
-- Users only need business_name, service_areas for selecting preferred contractor
DROP POLICY IF EXISTS "Authenticated users can view active contractors" ON public.contractors;

-- Create a database function to get safe contractor info (returns limited fields)
CREATE OR REPLACE FUNCTION public.get_safe_contractor_info(contractor_ids uuid[])
RETURNS TABLE (
  id uuid,
  business_name text,
  service_areas text[],
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.business_name, c.service_areas, c.is_active
  FROM public.contractors c
  WHERE c.id = ANY(contractor_ids) AND c.is_active = true;
$$;

-- Create view for safe contractor info (limited fields only)
CREATE OR REPLACE VIEW public.contractors_public AS
SELECT 
  id,
  business_name,
  service_areas,
  is_active,
  user_id
FROM public.contractors
WHERE is_active = true;

-- Grant access to the view
GRANT SELECT ON public.contractors_public TO authenticated;

-- 3. Reviews: Restrict to relevant parties only (customer, contractor, admin)
DROP POLICY IF EXISTS "Users can view all reviews" ON public.reviews;

-- Create policy for reviews visible only to involved parties
CREATE POLICY "Users can view relevant reviews"
ON public.reviews
FOR SELECT
USING (
  user_id = auth.uid() 
  OR contractor_id IN (
    SELECT c.id FROM public.contractors c WHERE c.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin')
);

-- Drop redundant policy if it exists (we now have a combined one)
DROP POLICY IF EXISTS "Users can view their own reviews" ON public.reviews;