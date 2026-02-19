
-- Add performance metrics columns to contractors
ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS completed_jobs_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS cancelled_jobs_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS disputed_jobs_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_revenue numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS average_response_time_hours numeric;

-- Function to recalculate contractor metrics
CREATE OR REPLACE FUNCTION public.update_contractor_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _contractor_id uuid;
  _completed integer;
  _cancelled integer;
  _disputed integer;
  _revenue numeric;
  _last_active timestamp with time zone;
  _avg_response numeric;
BEGIN
  _contractor_id := COALESCE(NEW.contractor_id, OLD.contractor_id);
  
  IF _contractor_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Completed jobs count
  SELECT COUNT(*) INTO _completed
  FROM bookings
  WHERE contractor_id = _contractor_id
    AND status IN ('completed', 'completed_pending_verification');

  -- Cancelled jobs count
  SELECT COUNT(*) INTO _cancelled
  FROM bookings
  WHERE contractor_id = _contractor_id
    AND status = 'cancelled';

  -- Disputed jobs count
  SELECT COUNT(DISTINCT d.booking_id) INTO _disputed
  FROM disputes d
  JOIN bookings b ON b.id = d.booking_id
  WHERE b.contractor_id = _contractor_id;

  -- Total revenue
  SELECT COALESCE(SUM(total_price), 0) INTO _revenue
  FROM bookings
  WHERE contractor_id = _contractor_id
    AND status IN ('completed', 'completed_pending_verification')
    AND total_price IS NOT NULL;

  -- Last active (most recent accept or complete)
  SELECT GREATEST(
    MAX(contractor_accepted_at),
    MAX(completed_at)
  ) INTO _last_active
  FROM bookings
  WHERE contractor_id = _contractor_id;

  -- Average response time (hours between booking creation and contractor acceptance)
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (contractor_accepted_at - created_at)) / 3600)::numeric, 1)
  INTO _avg_response
  FROM bookings
  WHERE contractor_id = _contractor_id
    AND contractor_accepted_at IS NOT NULL;

  UPDATE contractors
  SET completed_jobs_count = _completed,
      cancelled_jobs_count = _cancelled,
      disputed_jobs_count = _disputed,
      total_revenue = _revenue,
      last_active_at = _last_active,
      average_response_time_hours = _avg_response
  WHERE id = _contractor_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Trigger on bookings status changes
CREATE TRIGGER update_contractor_metrics_on_booking
AFTER INSERT OR UPDATE OF status, contractor_id, contractor_accepted_at, completed_at
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_contractor_metrics();

-- Backfill existing data
DO $$
DECLARE
  c_id uuid;
BEGIN
  FOR c_id IN SELECT id FROM contractors LOOP
    UPDATE contractors
    SET completed_jobs_count = (
      SELECT COUNT(*) FROM bookings WHERE contractor_id = c_id AND status IN ('completed', 'completed_pending_verification')
    ),
    cancelled_jobs_count = (
      SELECT COUNT(*) FROM bookings WHERE contractor_id = c_id AND status = 'cancelled'
    ),
    disputed_jobs_count = (
      SELECT COUNT(DISTINCT d.booking_id) FROM disputes d JOIN bookings b ON b.id = d.booking_id WHERE b.contractor_id = c_id
    ),
    total_revenue = (
      SELECT COALESCE(SUM(total_price), 0) FROM bookings WHERE contractor_id = c_id AND status IN ('completed', 'completed_pending_verification') AND total_price IS NOT NULL
    ),
    last_active_at = (
      SELECT GREATEST(MAX(contractor_accepted_at), MAX(completed_at)) FROM bookings WHERE contractor_id = c_id
    ),
    average_response_time_hours = (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (contractor_accepted_at - created_at)) / 3600)::numeric, 1)
      FROM bookings WHERE contractor_id = c_id AND contractor_accepted_at IS NOT NULL
    )
    WHERE id = c_id;
  END LOOP;
END $$;
