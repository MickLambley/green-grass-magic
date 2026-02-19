-- Allow users to delete their own addresses
CREATE POLICY "Users can delete their own addresses" 
ON public.addresses 
FOR DELETE 
USING (auth.uid() = user_id);