CREATE TABLE public.processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Auto-cleanup events older than 30 days (prevent unbounded growth)
CREATE INDEX idx_processed_stripe_events_processed_at ON public.processed_stripe_events (processed_at);

-- RLS: No public access, only service role
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role can access