
-- Add rating fields to bookings table
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_rating integer CHECK (customer_rating >= 1 AND customer_rating <= 5),
  ADD COLUMN IF NOT EXISTS rating_comment text,
  ADD COLUMN IF NOT EXISTS rating_submitted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS contractor_rating_response text;

-- Add average rating fields to contractors table
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS average_rating numeric(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ratings_count integer DEFAULT 0;

-- Create function to recalculate contractor average rating
CREATE OR REPLACE FUNCTION public.update_contractor_average_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _contractor_id uuid;
  _avg numeric(2,1);
  _count integer;
BEGIN
  -- Get the contractor_id from the booking
  _contractor_id := NEW.contractor_id;
  
  IF _contractor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate new average and count
  SELECT 
    COALESCE(ROUND(AVG(customer_rating)::numeric, 1), 0),
    COUNT(customer_rating)
  INTO _avg, _count
  FROM bookings
  WHERE contractor_id = _contractor_id
    AND customer_rating IS NOT NULL;

  -- Update contractor record
  UPDATE contractors
  SET average_rating = _avg,
      total_ratings_count = _count
  WHERE id = _contractor_id;

  RETURN NEW;
END;
$$;

-- Create trigger to update average on rating change
CREATE TRIGGER update_contractor_rating_on_booking
  AFTER INSERT OR UPDATE OF customer_rating ON public.bookings
  FOR EACH ROW
  WHEN (NEW.customer_rating IS NOT NULL)
  EXECUTE FUNCTION public.update_contractor_average_rating();

-- Create function to send admin alert for low ratings
CREATE OR REPLACE FUNCTION public.notify_admin_low_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _admin_id uuid;
  _contractor_name text;
  _avg_rating numeric;
BEGIN
  -- Only act when a rating is newly submitted
  IF NEW.customer_rating IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get contractor business name
  SELECT business_name INTO _contractor_name
  FROM contractors WHERE id = NEW.contractor_id;

  -- For each admin, send notification
  FOR _admin_id IN
    SELECT user_id FROM user_roles WHERE role = 'admin'
  LOOP
    -- Immediate alert for 1-star ratings
    IF NEW.customer_rating = 1 THEN
      INSERT INTO notifications (user_id, title, message, type, booking_id)
      VALUES (
        _admin_id,
        '⚠️ 1-Star Rating Alert',
        'A job by ' || COALESCE(_contractor_name, 'Unknown') || ' received a 1-star rating. Immediate review recommended.',
        'warning',
        NEW.id
      );
    END IF;

    -- Check if contractor average dropped below 3.5
    SELECT average_rating INTO _avg_rating
    FROM contractors WHERE id = NEW.contractor_id;

    IF _avg_rating IS NOT NULL AND _avg_rating < 3.5 THEN
      INSERT INTO notifications (user_id, title, message, type, booking_id)
      VALUES (
        _admin_id,
        '📉 Low Average Rating',
        'Contractor ' || COALESCE(_contractor_name, 'Unknown') || ' average rating is now ' || _avg_rating || '. Review recommended.',
        'warning',
        NEW.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger for low rating admin alerts (runs after the average is updated)
CREATE TRIGGER notify_admin_on_low_rating
  AFTER UPDATE OF customer_rating ON public.bookings
  FOR EACH ROW
  WHEN (NEW.customer_rating IS NOT NULL AND OLD.customer_rating IS NULL)
  EXECUTE FUNCTION public.notify_admin_low_rating();

-- Also trigger on insert with rating
CREATE TRIGGER notify_admin_on_low_rating_insert
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.customer_rating IS NOT NULL)
  EXECUTE FUNCTION public.notify_admin_low_rating();
