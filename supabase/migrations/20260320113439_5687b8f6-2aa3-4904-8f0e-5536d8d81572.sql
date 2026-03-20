ALTER TABLE public.invoices ADD COLUMN sent_at timestamp with time zone DEFAULT NULL;

-- Backfill: mark existing "sent" status invoices as sent
UPDATE public.invoices SET sent_at = updated_at, status = 'unpaid' WHERE status = 'sent';