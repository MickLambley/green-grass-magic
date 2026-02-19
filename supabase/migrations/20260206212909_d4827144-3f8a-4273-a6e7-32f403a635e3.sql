-- Create lawn area revisions table to track history of lawn drawings
CREATE TABLE public.lawn_area_revisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address_id UUID NOT NULL REFERENCES public.addresses(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL DEFAULT 1,
  square_meters NUMERIC,
  lawn_image_url TEXT,
  polygon_data JSONB, -- Stores array of polygon coordinates
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  notes TEXT
);

-- Create index for faster lookups
CREATE INDEX idx_lawn_area_revisions_address ON public.lawn_area_revisions(address_id);
CREATE INDEX idx_lawn_area_revisions_current ON public.lawn_area_revisions(address_id, is_current) WHERE is_current = true;

-- Ensure only one current revision per address
CREATE UNIQUE INDEX idx_lawn_area_revisions_unique_current ON public.lawn_area_revisions(address_id) WHERE is_current = true;

-- Enable RLS
ALTER TABLE public.lawn_area_revisions ENABLE ROW LEVEL SECURITY;

-- Admins can manage all revisions
CREATE POLICY "Admins can manage lawn area revisions"
ON public.lawn_area_revisions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view current revision for their own addresses
CREATE POLICY "Users can view current revision for their addresses"
ON public.lawn_area_revisions
FOR SELECT
USING (
  is_current = true
  AND address_id IN (
    SELECT id FROM addresses WHERE user_id = auth.uid()
  )
);

-- Contractors can view current revision for addresses they can access
CREATE POLICY "Contractors can view current revision for job addresses"
ON public.lawn_area_revisions
FOR SELECT
USING (
  is_current = true
  AND address_id IN (
    SELECT a.id FROM addresses a
    JOIN bookings b ON b.address_id = a.id
    JOIN contractors c ON b.contractor_id = c.id
    WHERE c.user_id = auth.uid()
  )
);