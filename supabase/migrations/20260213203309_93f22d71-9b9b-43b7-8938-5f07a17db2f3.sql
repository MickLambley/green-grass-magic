
-- Add dispute reason category and suggested refund amount to disputes table
ALTER TABLE public.disputes
ADD COLUMN dispute_reason text DEFAULT NULL,
ADD COLUMN suggested_refund_amount numeric DEFAULT NULL;
