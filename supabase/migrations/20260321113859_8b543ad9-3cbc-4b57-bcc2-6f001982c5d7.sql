
-- Create recurring_series table
CREATE TABLE public.recurring_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  frequency text NOT NULL DEFAULT 'weekly',
  series_start_date date NOT NULL,
  series_time text,
  series_anchor_day integer NOT NULL DEFAULT 0,
  total_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage their own series"
  ON public.recurring_series FOR ALL TO authenticated
  USING (contractor_id IN (SELECT id FROM contractors WHERE user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT id FROM contractors WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all series"
  ON public.recurring_series FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Backfill from existing recurring jobs
INSERT INTO public.recurring_series (id, contractor_id, frequency, series_start_date, series_time, series_anchor_day, total_count)
SELECT
  j.recurring_job_id,
  j.contractor_id,
  COALESCE((j.recurrence_rule->>'frequency'), 'weekly'),
  min_dates.min_date,
  j.scheduled_time,
  EXTRACT(DOW FROM min_dates.min_date)::integer,
  series_counts.cnt
FROM (
  SELECT DISTINCT ON (recurring_job_id) recurring_job_id, contractor_id, recurrence_rule, scheduled_time
  FROM jobs
  WHERE recurring_job_id IS NOT NULL
  ORDER BY recurring_job_id, scheduled_date ASC
) j
JOIN (
  SELECT recurring_job_id, MIN(scheduled_date) as min_date
  FROM jobs WHERE recurring_job_id IS NOT NULL
  GROUP BY recurring_job_id
) min_dates ON min_dates.recurring_job_id = j.recurring_job_id
JOIN (
  SELECT recurring_job_id, COUNT(*) as cnt
  FROM jobs WHERE recurring_job_id IS NOT NULL
  GROUP BY recurring_job_id
) series_counts ON series_counts.recurring_job_id = j.recurring_job_id
ON CONFLICT (id) DO NOTHING;
