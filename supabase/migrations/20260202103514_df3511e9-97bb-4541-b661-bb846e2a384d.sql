-- Create table for alternative time suggestions from contractors
CREATE TABLE public.alternative_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  suggested_date DATE NOT NULL,
  suggested_time_slot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(booking_id, contractor_id)
);

-- Enable RLS
ALTER TABLE public.alternative_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can view suggestions for their own bookings
CREATE POLICY "Users can view suggestions for their bookings"
ON public.alternative_suggestions
FOR SELECT
USING (
  booking_id IN (
    SELECT id FROM public.bookings WHERE user_id = auth.uid()
  )
);

-- Users can update (accept/decline) suggestions for their own bookings
CREATE POLICY "Users can respond to suggestions for their bookings"
ON public.alternative_suggestions
FOR UPDATE
USING (
  booking_id IN (
    SELECT id FROM public.bookings WHERE user_id = auth.uid()
  )
);

-- Contractors can view suggestions they made
CREATE POLICY "Contractors can view their suggestions"
ON public.alternative_suggestions
FOR SELECT
USING (
  contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  )
);

-- Contractors can insert suggestions for pending bookings
CREATE POLICY "Contractors can create suggestions"
ON public.alternative_suggestions
FOR INSERT
WITH CHECK (
  contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  )
);

-- Admins can view all suggestions
CREATE POLICY "Admins can view all suggestions"
ON public.alternative_suggestions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all suggestions
CREATE POLICY "Admins can manage all suggestions"
ON public.alternative_suggestions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));