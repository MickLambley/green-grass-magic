
-- =============================================
-- YARDLY PIVOT: Schema Migration
-- =============================================

-- 1. Extend jobs table for website booking flow
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS address_id uuid REFERENCES public.addresses(id),
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_url text,
  ADD COLUMN IF NOT EXISTS quote_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS customer_user_id uuid;

-- 2. Add job_id column to alternative_suggestions (alongside existing booking_id)
ALTER TABLE public.alternative_suggestions
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id);

-- 3. Add job_id to disputes for contractor-customer disputes
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id),
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id);

-- 4. Add job_id to job_photos so photos can be linked to jobs directly
ALTER TABLE public.job_photos
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id);

-- Make booking_id nullable on job_photos (new jobs won't have bookings)
ALTER TABLE public.job_photos ALTER COLUMN booking_id DROP NOT NULL;

-- Make booking_id nullable on disputes (new disputes reference jobs)
ALTER TABLE public.disputes ALTER COLUMN booking_id DROP NOT NULL;

-- Make booking_id nullable on alternative_suggestions
ALTER TABLE public.alternative_suggestions ALTER COLUMN booking_id DROP NOT NULL;

-- 5. RLS policies for new dispute flow (contractor-customer direct)
-- Contractors can view disputes for their jobs
CREATE POLICY "Contractors can view disputes for their jobs"
ON public.disputes FOR SELECT
USING (
  contractor_id IN (
    SELECT id FROM contractors WHERE user_id = auth.uid()
  )
);

-- Contractors can respond to disputes on their jobs
CREATE POLICY "Contractors can respond to job disputes"
ON public.disputes FOR UPDATE
USING (
  contractor_id IN (
    SELECT id FROM contractors WHERE user_id = auth.uid()
  )
);

-- Customers can create disputes on jobs (via client link)
CREATE POLICY "Customers can create job disputes"
ON public.disputes FOR INSERT
WITH CHECK (
  job_id IN (
    SELECT j.id FROM jobs j
    JOIN clients c ON j.client_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- Customers can view disputes on their jobs
CREATE POLICY "Customers can view job disputes"
ON public.disputes FOR SELECT
USING (
  job_id IN (
    SELECT j.id FROM jobs j
    JOIN clients c ON j.client_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- 6. RLS for job_photos with job_id
CREATE POLICY "Contractors can insert photos for their jobs"
ON public.job_photos FOR INSERT
WITH CHECK (
  contractor_id IN (
    SELECT id FROM contractors WHERE user_id = auth.uid()
  )
  AND (
    job_id IN (
      SELECT id FROM jobs WHERE contractor_id IN (
        SELECT id FROM contractors WHERE user_id = auth.uid()
      )
    )
    OR booking_id IN (
      SELECT b.id FROM bookings b
      JOIN contractors c ON b.contractor_id = c.id
      WHERE c.user_id = auth.uid()
    )
  )
);

-- 7. RLS for alternative_suggestions with job_id
CREATE POLICY "Contractors can create job suggestions"
ON public.alternative_suggestions FOR INSERT
WITH CHECK (
  contractor_id IN (
    SELECT id FROM contractors WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Contractors can view job suggestions"
ON public.alternative_suggestions FOR SELECT
USING (
  contractor_id IN (
    SELECT id FROM contractors WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Customers can view job suggestions"
ON public.alternative_suggestions FOR SELECT
USING (
  job_id IN (
    SELECT j.id FROM jobs j
    JOIN clients c ON j.client_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Customers can respond to job suggestions"
ON public.alternative_suggestions FOR UPDATE
USING (
  job_id IN (
    SELECT j.id FROM jobs j
    JOIN clients c ON j.client_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- 8. Allow customers to view their own jobs via client link
CREATE POLICY "Customers can view their jobs via client"
ON public.jobs FOR SELECT
USING (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
  )
);

-- 9. Add index for performance
CREATE INDEX IF NOT EXISTS idx_jobs_source ON public.jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_contractor_status ON public.jobs(contractor_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON public.jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_job_id ON public.disputes(job_id);
CREATE INDEX IF NOT EXISTS idx_alternative_suggestions_job_id ON public.alternative_suggestions(job_id);
