-- Create pricing_settings table for admin-configurable rates
CREATE TABLE public.pricing_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only access for pricing settings
CREATE POLICY "Admins can manage pricing settings"
ON public.pricing_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can read pricing settings for quote calculation
CREATE POLICY "Users can view pricing settings"
ON public.pricing_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Insert default pricing settings
INSERT INTO public.pricing_settings (key, value, description) VALUES
  ('base_price_per_sqm', 0.15, 'Base price per square meter'),
  ('fixed_base_price', 25, 'Fixed base price for all services'),
  ('grass_length_short', 1.0, 'Multiplier for short grass (below ankle)'),
  ('grass_length_medium', 1.25, 'Multiplier for medium grass (ankle height)'),
  ('grass_length_long', 1.5, 'Multiplier for long grass (shin height)'),
  ('grass_length_very_long', 2.0, 'Multiplier for very long grass (knee height or above)'),
  ('clipping_removal_cost', 15, 'Extra cost for removing grass clippings'),
  ('saturday_surcharge', 1.25, 'Surcharge multiplier for Saturday'),
  ('sunday_surcharge', 1.5, 'Surcharge multiplier for Sunday'),
  ('public_holiday_surcharge', 2.0, 'Surcharge multiplier for public holidays'),
  ('slope_mild_multiplier', 1.15, 'Multiplier for mild slope'),
  ('slope_steep_multiplier', 1.35, 'Multiplier for steep slope'),
  ('tier_multiplier', 0.1, 'Additional multiplier per extra tier'),
  ('contractor_acceptance_hours', 4, 'Hours before contractors can suggest alternative times');

-- Add trigger for updated_at
CREATE TRIGGER update_pricing_settings_updated_at
BEFORE UPDATE ON public.pricing_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add new columns to bookings table
ALTER TABLE public.bookings 
  ADD COLUMN grass_length text NOT NULL DEFAULT 'medium',
  ADD COLUMN clippings_removal boolean NOT NULL DEFAULT false,
  ADD COLUMN time_slot text NOT NULL DEFAULT '10am-2pm',
  ADD COLUMN is_weekend boolean NOT NULL DEFAULT false,
  ADD COLUMN is_public_holiday boolean NOT NULL DEFAULT false,
  ADD COLUMN quote_breakdown jsonb,
  ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN payment_intent_id text,
  ADD COLUMN contractor_id uuid,
  ADD COLUMN contractor_accepted_at timestamp with time zone,
  ADD COLUMN alternative_date date,
  ADD COLUMN alternative_time_slot text,
  ADD COLUMN alternative_suggested_by uuid,
  ADD COLUMN alternative_suggested_at timestamp with time zone;

-- Create contractors table
CREATE TABLE public.contractors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  business_name text,
  phone text,
  service_areas text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on contractors
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

-- Contractors can view and update their own profile
CREATE POLICY "Contractors can view their own profile"
ON public.contractors
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Contractors can update their own profile"
ON public.contractors
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can manage all contractors
CREATE POLICY "Admins can manage contractors"
ON public.contractors
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at on contractors
CREATE TRIGGER update_contractors_updated_at
BEFORE UPDATE ON public.contractors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add contractor role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'contractor';