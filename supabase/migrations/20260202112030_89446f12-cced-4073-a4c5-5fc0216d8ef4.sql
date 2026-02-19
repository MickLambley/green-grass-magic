-- Add new columns to contractors table for application details
ALTER TABLE public.contractors 
ADD COLUMN IF NOT EXISTS abn TEXT,
ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS insurance_certificate_url TEXT,
ADD COLUMN IF NOT EXISTS business_address TEXT,
ADD COLUMN IF NOT EXISTS questionnaire_responses JSONB,
ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC,
ADD COLUMN IF NOT EXISTS service_center_lat NUMERIC,
ADD COLUMN IF NOT EXISTS service_center_lng NUMERIC,
ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS approved_by UUID;

-- Add index for approval status lookups
CREATE INDEX IF NOT EXISTS idx_contractors_approval_status ON public.contractors(approval_status);

-- Create storage bucket for contractor documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('contractor-documents', 'contractor-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for contractor documents
CREATE POLICY "Contractors can upload their own documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'contractor-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Contractors can view their own documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'contractor-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all contractor documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'contractor-documents' 
  AND has_role(auth.uid(), 'admin')
);

CREATE POLICY "Contractors can update their own documents"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'contractor-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Contractors can delete their own documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'contractor-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);