
-- ============================================
-- Route Optimization Feature Schema
-- ============================================

-- 1. Add new columns to jobs table
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS time_flexibility TEXT NOT NULL DEFAULT 'time_restricted',
  ADD COLUMN IF NOT EXISTS original_scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS original_time_slot TEXT,
  ADD COLUMN IF NOT EXISTS route_optimization_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Add check constraint for time_flexibility
ALTER TABLE public.jobs 
  ADD CONSTRAINT jobs_time_flexibility_check 
  CHECK (time_flexibility IN ('flexible', 'time_restricted'));

-- 2. Create route_optimizations table
CREATE TABLE public.route_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  optimization_date DATE NOT NULL,
  level INTEGER NOT NULL,
  time_saved_minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT route_optimizations_status_check CHECK (status IN ('pending_approval', 'applied', 'declined', 'awaiting_customer')),
  CONSTRAINT route_optimizations_level_check CHECK (level BETWEEN 1 AND 3)
);

-- Enable RLS
ALTER TABLE public.route_optimizations ENABLE ROW LEVEL SECURITY;

-- RLS: Contractors can view their own optimizations
CREATE POLICY "Contractors can view their own optimizations"
  ON public.route_optimizations FOR SELECT
  USING (contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  ));

-- RLS: Contractors can update their own optimizations (accept/decline)
CREATE POLICY "Contractors can update their own optimizations"
  ON public.route_optimizations FOR UPDATE
  USING (contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  ));

-- RLS: System inserts via service role, but also allow contractor insert
CREATE POLICY "Contractors can insert their own optimizations"
  ON public.route_optimizations FOR INSERT
  WITH CHECK (contractor_id IN (
    SELECT id FROM public.contractors WHERE user_id = auth.uid()
  ));

-- RLS: Admins can manage all
CREATE POLICY "Admins can manage all optimizations"
  ON public.route_optimizations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Create route_optimization_suggestions table
CREATE TABLE public.route_optimization_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_optimization_id UUID NOT NULL REFERENCES public.route_optimizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  current_date_val DATE NOT NULL,
  current_time_slot TEXT NOT NULL,
  suggested_date DATE NOT NULL,
  suggested_time_slot TEXT NOT NULL,
  requires_customer_approval BOOLEAN NOT NULL DEFAULT FALSE,
  customer_approval_status TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT ros_time_slot_check CHECK (current_time_slot IN ('morning', 'afternoon')),
  CONSTRAINT ros_suggested_time_slot_check CHECK (suggested_time_slot IN ('morning', 'afternoon')),
  CONSTRAINT ros_customer_status_check CHECK (customer_approval_status IN ('pending', 'approved', 'declined'))
);

-- Enable RLS
ALTER TABLE public.route_optimization_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS: Contractors can view suggestions for their optimizations
CREATE POLICY "Contractors can view their optimization suggestions"
  ON public.route_optimization_suggestions FOR SELECT
  USING (route_optimization_id IN (
    SELECT id FROM public.route_optimizations WHERE contractor_id IN (
      SELECT id FROM public.contractors WHERE user_id = auth.uid()
    )
  ));

-- RLS: Contractors can insert suggestions
CREATE POLICY "Contractors can insert optimization suggestions"
  ON public.route_optimization_suggestions FOR INSERT
  WITH CHECK (route_optimization_id IN (
    SELECT id FROM public.route_optimizations WHERE contractor_id IN (
      SELECT id FROM public.contractors WHERE user_id = auth.uid()
    )
  ));

-- RLS: Contractors can update suggestions
CREATE POLICY "Contractors can update optimization suggestions"
  ON public.route_optimization_suggestions FOR UPDATE
  USING (route_optimization_id IN (
    SELECT id FROM public.route_optimizations WHERE contractor_id IN (
      SELECT id FROM public.contractors WHERE user_id = auth.uid()
    )
  ));

-- RLS: Customers can view and respond to suggestions for their jobs
CREATE POLICY "Customers can view suggestions for their jobs"
  ON public.route_optimization_suggestions FOR SELECT
  USING (job_id IN (
    SELECT j.id FROM public.jobs j
    JOIN public.clients c ON j.client_id = c.id
    WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "Customers can respond to suggestions for their jobs"
  ON public.route_optimization_suggestions FOR UPDATE
  USING (job_id IN (
    SELECT j.id FROM public.jobs j
    JOIN public.clients c ON j.client_id = c.id
    WHERE c.user_id = auth.uid()
  ));

-- RLS: Admins can manage all
CREATE POLICY "Admins can manage all optimization suggestions"
  ON public.route_optimization_suggestions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Create indexes for performance
CREATE INDEX idx_route_optimizations_contractor ON public.route_optimizations(contractor_id, optimization_date);
CREATE INDEX idx_route_optimizations_status ON public.route_optimizations(status);
CREATE INDEX idx_route_opt_suggestions_optimization ON public.route_optimization_suggestions(route_optimization_id);
CREATE INDEX idx_jobs_time_flexibility ON public.jobs(time_flexibility) WHERE time_flexibility = 'flexible';
CREATE INDEX idx_jobs_route_locked ON public.jobs(route_optimization_locked) WHERE route_optimization_locked = TRUE;
