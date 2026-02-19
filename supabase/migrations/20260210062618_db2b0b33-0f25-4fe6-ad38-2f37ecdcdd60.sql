-- Add Stripe Connect fields to contractors table
ALTER TABLE public.contractors
ADD COLUMN stripe_account_id text,
ADD COLUMN stripe_onboarding_complete boolean NOT NULL DEFAULT false,
ADD COLUMN stripe_payouts_enabled boolean NOT NULL DEFAULT false;
