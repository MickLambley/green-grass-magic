
-- Service offerings table for contractors
CREATE TABLE public.service_offerings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  default_rate NUMERIC,
  rate_type TEXT NOT NULL DEFAULT 'fixed',
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_quote BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.service_offerings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage their own service offerings"
ON public.service_offerings FOR ALL
TO authenticated
USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()))
WITH CHECK (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can view active service offerings for published contractors"
ON public.service_offerings FOR SELECT
TO anon, authenticated
USING (is_active = true AND contractor_id IN (SELECT id FROM public.contractors WHERE website_published = true));

-- Add quote fields to jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS requires_quote BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS quote_type TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS quoted_rate NUMERIC;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS quoted_hours NUMERIC;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS quote_status TEXT NOT NULL DEFAULT 'none';
