
-- Auto-shift trigger: prevents overlapping jobs for the same contractor on the same day
-- by pushing the new/updated job's scheduled_time to after the last conflicting job ends.

CREATE OR REPLACE FUNCTION public.auto_shift_job_time()
RETURNS TRIGGER AS $$
DECLARE
  new_start_min INT;
  new_end_min INT;
  new_duration INT;
  conflict_end INT;
  has_conflict BOOLEAN := TRUE;
  max_iterations INT := 20;
  i INT := 0;
BEGIN
  -- Only act if the job has a scheduled_time and is not cancelled
  IF NEW.scheduled_time IS NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  new_duration := COALESCE(NEW.duration_minutes, 60);
  new_start_min := EXTRACT(HOUR FROM NEW.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM NEW.scheduled_time::time);
  new_end_min := new_start_min + new_duration;

  -- Iteratively shift until no conflicts
  WHILE has_conflict AND i < max_iterations LOOP
    i := i + 1;
    
    SELECT MAX(
      EXTRACT(HOUR FROM j.scheduled_time::time) * 60 + 
      EXTRACT(MINUTE FROM j.scheduled_time::time) + 
      COALESCE(j.duration_minutes, 60)
    )
    INTO conflict_end
    FROM public.jobs j
    WHERE j.contractor_id = NEW.contractor_id
      AND j.scheduled_date = NEW.scheduled_date
      AND j.id != NEW.id
      AND j.status != 'cancelled'
      AND j.scheduled_time IS NOT NULL
      -- Overlap check: new_start < existing_end AND new_end > existing_start
      AND new_start_min < (EXTRACT(HOUR FROM j.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM j.scheduled_time::time) + COALESCE(j.duration_minutes, 60))
      AND new_end_min > (EXTRACT(HOUR FROM j.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM j.scheduled_time::time));

    IF conflict_end IS NULL THEN
      has_conflict := FALSE;
    ELSE
      -- Round up to nearest 5 minutes
      new_start_min := ((conflict_end + 4) / 5) * 5;
      new_end_min := new_start_min + new_duration;
    END IF;
  END LOOP;

  -- Update scheduled_time if it was shifted
  IF new_start_min != (EXTRACT(HOUR FROM NEW.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM NEW.scheduled_time::time)) THEN
    NEW.scheduled_time := LPAD((new_start_min / 60)::TEXT, 2, '0') || ':' || LPAD((new_start_min % 60)::TEXT, 2, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger
DROP TRIGGER IF EXISTS trg_auto_shift_job_time ON public.jobs;
CREATE TRIGGER trg_auto_shift_job_time
  BEFORE INSERT OR UPDATE OF scheduled_time, scheduled_date, duration_minutes
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_shift_job_time();
