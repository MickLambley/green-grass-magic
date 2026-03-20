ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS business_client boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_abn text;