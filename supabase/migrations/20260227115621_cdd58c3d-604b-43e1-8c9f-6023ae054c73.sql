-- P1-03: Validation triggers for jobs.status and contractors.subscription_tier
-- P2-03: Compound index for jobs query performance

-- Validation trigger for jobs.status
CREATE OR REPLACE FUNCTION public.validate_job_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'pending_confirmation') THEN
    RAISE EXCEPTION 'Invalid job status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_job_status ON public.jobs;
CREATE TRIGGER trg_validate_job_status
  BEFORE INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_job_status();

-- Validation trigger for contractors.subscription_tier
CREATE OR REPLACE FUNCTION public.validate_subscription_tier()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.subscription_tier NOT IN ('free', 'starter', 'pro', 'team') THEN
    RAISE EXCEPTION 'Invalid subscription tier: %', NEW.subscription_tier;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_subscription_tier ON public.contractors;
CREATE TRIGGER trg_validate_subscription_tier
  BEFORE INSERT OR UPDATE OF subscription_tier ON public.contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_subscription_tier();

-- P2-03: Compound index for jobs performance
CREATE INDEX IF NOT EXISTS idx_jobs_contractor_scheduled_date 
  ON public.jobs(contractor_id, scheduled_date DESC);