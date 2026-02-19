
-- Add 'disputed' to the booking_status enum
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'disputed';

-- Create disputes table
CREATE TABLE public.disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  raised_by TEXT NOT NULL CHECK (raised_by IN ('customer', 'contractor')),
  description TEXT NOT NULL,
  customer_photos TEXT[] DEFAULT '{}',
  contractor_response TEXT,
  contractor_response_photos TEXT[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved')),
  resolution TEXT CHECK (resolution IN ('full_refund', 'partial_refund', 'no_refund')),
  refund_percentage INTEGER,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Customers can view disputes for their own bookings
CREATE POLICY "Customers can view their disputes"
  ON public.disputes FOR SELECT
  USING (booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid()));

-- Customers can create disputes for their own bookings
CREATE POLICY "Customers can create disputes"
  ON public.disputes FOR INSERT
  WITH CHECK (
    raised_by = 'customer'
    AND booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

-- Contractors can view disputes for their bookings
CREATE POLICY "Contractors can view disputes for their bookings"
  ON public.disputes FOR SELECT
  USING (booking_id IN (
    SELECT b.id FROM public.bookings b
    JOIN public.contractors c ON b.contractor_id = c.id
    WHERE c.user_id = auth.uid()
  ));

-- Contractors can update their response on disputes
CREATE POLICY "Contractors can respond to disputes"
  ON public.disputes FOR UPDATE
  USING (booking_id IN (
    SELECT b.id FROM public.bookings b
    JOIN public.contractors c ON b.contractor_id = c.id
    WHERE c.user_id = auth.uid()
  ));

-- Admins can manage all disputes
CREATE POLICY "Admins can manage disputes"
  ON public.disputes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for dispute photos
INSERT INTO storage.buckets (id, name, public) VALUES ('dispute-photos', 'dispute-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for dispute photos
CREATE POLICY "Customers can upload dispute photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'dispute-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view dispute photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dispute-photos' AND auth.uid() IS NOT NULL);
