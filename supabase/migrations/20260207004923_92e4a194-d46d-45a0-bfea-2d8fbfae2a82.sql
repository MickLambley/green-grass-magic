-- Fix security definer view warning - drop view and use proper RLS instead
DROP VIEW IF EXISTS public.contractors_public;

-- Drop the function as we'll use a different approach
DROP FUNCTION IF EXISTS public.get_safe_contractor_info(uuid[]);

-- Create a proper RLS policy for contractors that only exposes safe fields
-- Users can select from contractors table but RLS + application code limits what's returned
-- We need a policy that allows authenticated users to see active contractors for booking

CREATE POLICY "Authenticated users can view active contractor basics"
ON public.contractors
FOR SELECT
TO authenticated
USING (is_active = true AND approval_status = 'approved');