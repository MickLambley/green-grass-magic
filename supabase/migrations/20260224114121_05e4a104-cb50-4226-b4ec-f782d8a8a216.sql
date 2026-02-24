
-- Fix search_path security warning for our function
CREATE OR REPLACE FUNCTION public.auto_shift_job_time()
RETURNS TRIGGER
SET search_path = ''
AS $$
DECLARE
  new_start_min INT;
  new_end_min INT;
  new_duration INT;
  conflict_end INT;
  has_conflict BOOLEAN := TRUE;
  max_iterations INT := 20;
  i INT := 0;
BEGIN
  IF NEW.scheduled_time IS NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  new_duration := COALESCE(NEW.duration_minutes, 60);
  new_start_min := EXTRACT(HOUR FROM NEW.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM NEW.scheduled_time::time);
  new_end_min := new_start_min + new_duration;

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
      AND new_start_min < (EXTRACT(HOUR FROM j.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM j.scheduled_time::time) + COALESCE(j.duration_minutes, 60))
      AND new_end_min > (EXTRACT(HOUR FROM j.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM j.scheduled_time::time));

    IF conflict_end IS NULL THEN
      has_conflict := FALSE;
    ELSE
      new_start_min := ((conflict_end + 4) / 5) * 5;
      new_end_min := new_start_min + new_duration;
    END IF;
  END LOOP;

  IF new_start_min != (EXTRACT(HOUR FROM NEW.scheduled_time::time) * 60 + EXTRACT(MINUTE FROM NEW.scheduled_time::time)) THEN
    NEW.scheduled_time := LPAD((new_start_min / 60)::TEXT, 2, '0') || ':' || LPAD((new_start_min % 60)::TEXT, 2, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
