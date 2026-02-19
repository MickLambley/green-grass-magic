
-- 1. Evolve contractors table with new SaaS fields
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_bsb text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS business_logo_url text,
  ADD COLUMN IF NOT EXISTS subdomain text UNIQUE;

-- 2. Create clients table (contractor's customers)
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address jsonb,
  property_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view their own clients"
  ON public.clients FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can insert their own clients"
  ON public.clients FOR INSERT
  WITH CHECK (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can update their own clients"
  ON public.clients FOR UPDATE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can delete their own clients"
  ON public.clients FOR DELETE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all clients"
  ON public.clients FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Create jobs table (replaces bookings for new flow)
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Lawn Mowing',
  description text,
  status text NOT NULL DEFAULT 'scheduled',
  source text NOT NULL DEFAULT 'manual',
  scheduled_date date NOT NULL,
  scheduled_time text,
  duration_minutes integer,
  total_price numeric,
  notes text,
  recurrence_rule jsonb,
  completed_at timestamptz,
  payment_status text NOT NULL DEFAULT 'unpaid',
  payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view their own jobs"
  ON public.jobs FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can insert their own jobs"
  ON public.jobs FOR INSERT
  WITH CHECK (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can update their own jobs"
  ON public.jobs FOR UPDATE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can delete their own jobs"
  ON public.jobs FOR DELETE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all jobs"
  ON public.jobs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Create quotes table
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  valid_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view their own quotes"
  ON public.quotes FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can insert their own quotes"
  ON public.quotes FOR INSERT
  WITH CHECK (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can update their own quotes"
  ON public.quotes FOR UPDATE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can delete their own quotes"
  ON public.quotes FOR DELETE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all quotes"
  ON public.quotes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Create invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_number text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view their own invoices"
  ON public.invoices FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can insert their own invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can update their own invoices"
  ON public.invoices FOR UPDATE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can delete their own invoices"
  ON public.invoices FOR DELETE
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all invoices"
  ON public.invoices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Create transaction_fees table
CREATE TABLE public.transaction_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id),
  payment_amount numeric NOT NULL,
  stripe_fee numeric NOT NULL DEFAULT 0,
  yardly_fee numeric NOT NULL DEFAULT 0,
  yardly_fee_percentage numeric NOT NULL DEFAULT 5,
  contractor_payout numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view their own fees"
  ON public.transaction_fees FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.contractors WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all fees"
  ON public.transaction_fees FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 7. Updated_at triggers for new tables
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
