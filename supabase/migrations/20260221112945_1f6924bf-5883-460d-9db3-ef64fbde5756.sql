
-- Add user_id to clients table to link auth accounts
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_contractor_user ON public.clients(contractor_id, user_id) WHERE user_id IS NOT NULL;

-- Add theme columns to contractors table
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#16a34a';
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#15803d';
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#22c55e';

-- Allow customers to view their own client records (for portal access check)
CREATE POLICY "Customers can view their own client records"
ON public.clients FOR SELECT
USING (auth.uid() = user_id);

-- Allow public read of contractor branding for portal theming (already have policy for active approved contractors)
-- The existing "Authenticated users can view active contractor basics" policy already covers this
