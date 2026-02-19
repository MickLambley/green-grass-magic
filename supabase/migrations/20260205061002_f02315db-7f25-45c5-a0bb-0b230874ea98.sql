-- Allow users to insert a contractor role for themselves during onboarding
CREATE POLICY "Users can add contractor role for themselves"
ON public.user_roles
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND role = 'contractor'
);

-- Allow users to insert their own contractor profile during onboarding
CREATE POLICY "Users can create their own contractor profile"
ON public.contractors
FOR INSERT
WITH CHECK (auth.uid() = user_id);