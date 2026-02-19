-- Allow users to delete their own bookings that haven't been accepted by a contractor
CREATE POLICY "Users can delete their own unaccepted bookings" 
ON public.bookings 
FOR DELETE 
USING (auth.uid() = user_id AND contractor_id IS NULL);