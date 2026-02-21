
-- ============================================================
-- YARDLY B2B LEGACY CLEANUP v4
-- ============================================================

-- STEP 1: Drop ALL dependent policies
DROP POLICY IF EXISTS "Contractors can view addresses for available jobs" ON public.addresses;
DROP POLICY IF EXISTS "Contractors can view addresses for preferred bookings" ON public.addresses;
DROP POLICY IF EXISTS "Contractors can accept available jobs" ON public.bookings;
DROP POLICY IF EXISTS "Contractors can view available jobs" ON public.bookings;
DROP POLICY IF EXISTS "Contractors can update preferred bookings" ON public.bookings;
DROP POLICY IF EXISTS "Contractors can view preferred bookings" ON public.bookings;
DROP POLICY IF EXISTS "Contractors can view customer profiles for assigned bookings" ON public.profiles;
DROP POLICY IF EXISTS "Contractors view lawn images for their jobs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view active contractor basics" ON public.contractors;
DROP POLICY IF EXISTS "Admins can manage pricing settings" ON public.pricing_settings;
DROP POLICY IF EXISTS "Admins can manage lawn area revisions" ON public.lawn_area_revisions;
DROP POLICY IF EXISTS "Contractors can view current revision for job addresses" ON public.lawn_area_revisions;
DROP POLICY IF EXISTS "Users can view current revision for their addresses" ON public.lawn_area_revisions;
DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can view relevant reviews" ON public.reviews;

-- STEP 2: Drop ALL triggers on bookings that depend on status column
DROP TRIGGER IF EXISTS notify_admin_on_low_rating ON public.bookings;
DROP TRIGGER IF EXISTS notify_admin_on_low_rating_insert ON public.bookings;
DROP TRIGGER IF EXISTS update_contractor_metrics_on_booking ON public.bookings;
DROP TRIGGER IF EXISTS update_contractor_rating_on_booking ON public.bookings;
DROP TRIGGER IF EXISTS update_pricing_settings_updated_at ON public.pricing_settings;
DROP TRIGGER IF EXISTS update_reviews_updated_at ON public.reviews;

-- STEP 3: Drop legacy functions
DROP FUNCTION IF EXISTS public.notify_admin_low_rating();

-- STEP 4: Drop FK + columns from bookings
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_preferred_contractor_id_fkey;
ALTER TABLE public.bookings 
  DROP COLUMN IF EXISTS preferred_contractor_id,
  DROP COLUMN IF EXISTS original_price,
  DROP COLUMN IF EXISTS quote_breakdown,
  DROP COLUMN IF EXISTS contractor_issues,
  DROP COLUMN IF EXISTS contractor_issue_notes,
  DROP COLUMN IF EXISTS contractor_issue_photos,
  DROP COLUMN IF EXISTS price_change_notified_at;

-- STEP 5: Drop columns from contractors
ALTER TABLE public.contractors
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS applied_at,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS tier,
  DROP COLUMN IF EXISTS quality_warnings,
  DROP COLUMN IF EXISTS quality_reviews;

-- STEP 6: Drop legacy tables
DROP TABLE IF EXISTS public.pricing_settings CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.lawn_area_revisions CASCADE;

-- STEP 7: Swap booking_status enum
CREATE TYPE booking_status_new AS ENUM ('pending','confirmed','completed','cancelled','disputed','post_payment_dispute','completed_with_issues');
UPDATE public.bookings SET status = 'pending' WHERE status = 'pending_address_verification';
UPDATE public.bookings SET status = 'pending' WHERE status = 'price_change_pending';
UPDATE public.bookings SET status = 'completed' WHERE status = 'completed_pending_verification';
ALTER TABLE public.bookings ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.bookings ALTER COLUMN status TYPE booking_status_new USING status::text::booking_status_new;
ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'pending';
DROP TYPE booking_status;
ALTER TYPE booking_status_new RENAME TO booking_status;

-- STEP 8: Update and recreate functions/triggers

CREATE OR REPLACE FUNCTION public.update_contractor_metrics()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _contractor_id uuid; _completed integer; _cancelled integer;
  _disputed integer; _revenue numeric; _last_active timestamptz; _avg_response numeric;
BEGIN
  _contractor_id := COALESCE(NEW.contractor_id, OLD.contractor_id);
  IF _contractor_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COUNT(*) INTO _completed FROM bookings WHERE contractor_id = _contractor_id AND status = 'completed';
  SELECT COUNT(*) INTO _cancelled FROM bookings WHERE contractor_id = _contractor_id AND status = 'cancelled';
  SELECT COUNT(DISTINCT d.booking_id) INTO _disputed FROM disputes d JOIN bookings b ON b.id = d.booking_id WHERE b.contractor_id = _contractor_id;
  SELECT COALESCE(SUM(total_price), 0) INTO _revenue FROM bookings WHERE contractor_id = _contractor_id AND status = 'completed' AND total_price IS NOT NULL;
  SELECT GREATEST(MAX(contractor_accepted_at), MAX(completed_at)) INTO _last_active FROM bookings WHERE contractor_id = _contractor_id;
  SELECT ROUND(AVG(EXTRACT(EPOCH FROM (contractor_accepted_at - created_at)) / 3600)::numeric, 1) INTO _avg_response FROM bookings WHERE contractor_id = _contractor_id AND contractor_accepted_at IS NOT NULL;
  UPDATE contractors SET completed_jobs_count = _completed, cancelled_jobs_count = _cancelled, disputed_jobs_count = _disputed, total_revenue = _revenue, last_active_at = _last_active, average_response_time_hours = _avg_response WHERE id = _contractor_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Recreate triggers
CREATE TRIGGER update_contractor_metrics_on_booking
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_contractor_metrics();

CREATE TRIGGER update_contractor_rating_on_booking
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_contractor_average_rating();

-- STEP 9: Recreate B2B-relevant policies
CREATE POLICY "Authenticated users can view active contractors"
ON public.contractors FOR SELECT
USING (is_active = true);

CREATE POLICY "Contractors can view customer profiles for assigned bookings"
ON public.profiles FOR SELECT
USING (user_id IN (
  SELECT b.user_id FROM bookings b JOIN contractors c ON b.contractor_id = c.id
  WHERE c.user_id = auth.uid() AND b.status IN ('confirmed', 'completed')
));

CREATE POLICY "Contractors view lawn images for their jobs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'lawn-images' AND (
    EXISTS (
      SELECT 1 FROM bookings b JOIN addresses a ON a.id = b.address_id JOIN contractors c ON c.id = b.contractor_id
      WHERE c.user_id = auth.uid() AND b.status IN ('confirmed', 'completed') AND (storage.foldername(objects.name))[1] = a.user_id::text
    ) OR (
      (storage.foldername(name))[1] = 'admin' AND EXISTS (
        SELECT 1 FROM bookings b JOIN contractors c ON c.id = b.contractor_id
        WHERE c.user_id = auth.uid() AND b.status IN ('confirmed', 'completed') AND (storage.foldername(objects.name))[2] = b.address_id::text
      )
    )
  )
);

-- Drop the contractor_tier enum type since it's no longer used
DROP TYPE IF EXISTS contractor_tier;
