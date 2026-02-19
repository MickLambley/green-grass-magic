
-- Create user_status_audit table for tracking status changes
CREATE TABLE public.user_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  changed_by uuid NOT NULL,
  changed_by_email text,
  reason text,
  user_type text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_status_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write audit logs
CREATE POLICY "Admins can manage audit logs"
  ON public.user_status_audit
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));
