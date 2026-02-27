ALTER TABLE public.quotes ADD COLUMN token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex');

-- Backfill existing quotes
UPDATE public.quotes SET token = encode(gen_random_bytes(32), 'hex') WHERE token IS NULL;

-- Make non-nullable after backfill
ALTER TABLE public.quotes ALTER COLUMN token SET NOT NULL;