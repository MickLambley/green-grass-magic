
-- Australian postcodes reference table
CREATE TABLE public.australian_postcodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suburb text NOT NULL,
  postcode text NOT NULL,
  state text NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL
);

-- Indexes for spatial queries
CREATE INDEX idx_australian_postcodes_lat ON public.australian_postcodes (lat);
CREATE INDEX idx_australian_postcodes_lng ON public.australian_postcodes (lng);
CREATE INDEX idx_australian_postcodes_lat_lng ON public.australian_postcodes (lat, lng);
CREATE INDEX idx_australian_postcodes_suburb ON public.australian_postcodes (suburb);
CREATE INDEX idx_australian_postcodes_postcode ON public.australian_postcodes (postcode);

-- Enable RLS but allow public read access (reference data)
ALTER TABLE public.australian_postcodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read australian postcodes" ON public.australian_postcodes FOR SELECT USING (true);

-- Contractor service suburbs table
CREATE TABLE public.contractor_service_suburbs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  suburb text NOT NULL,
  postcode text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_contractor_service_suburbs_contractor ON public.contractor_service_suburbs (contractor_id);
CREATE INDEX idx_contractor_service_suburbs_suburb ON public.contractor_service_suburbs (suburb, postcode);

-- Enable RLS
ALTER TABLE public.contractor_service_suburbs ENABLE ROW LEVEL SECURITY;

-- Contractors can manage their own service suburbs
CREATE POLICY "Contractors can view their own service suburbs"
  ON public.contractor_service_suburbs FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can insert their own service suburbs"
  ON public.contractor_service_suburbs FOR INSERT
  WITH CHECK (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can delete their own service suburbs"
  ON public.contractor_service_suburbs FOR DELETE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

-- Public read access for contractor websites
CREATE POLICY "Anyone can view service suburbs for published contractors"
  ON public.contractor_service_suburbs FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE website_published = true));

-- Admins can manage all
CREATE POLICY "Admins can manage all service suburbs"
  ON public.contractor_service_suburbs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));
