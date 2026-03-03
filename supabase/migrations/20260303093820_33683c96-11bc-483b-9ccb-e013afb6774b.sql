
-- Table to cache suburb boundary GeoJSON polygons
CREATE TABLE public.suburb_boundaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suburb_name text NOT NULL,
  state text,
  boundary jsonb NOT NULL, -- array of polygon rings as [[{lat,lng},...],...]
  centroid_lat numeric,
  centroid_lng numeric,
  source text NOT NULL DEFAULT 'nominatim',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(suburb_name, state)
);

-- Index for fast lookups
CREATE INDEX idx_suburb_boundaries_name ON public.suburb_boundaries (suburb_name);
CREATE INDEX idx_suburb_boundaries_name_state ON public.suburb_boundaries (suburb_name, state);

-- Enable RLS
ALTER TABLE public.suburb_boundaries ENABLE ROW LEVEL SECURITY;

-- Anyone can read boundaries (public reference data)
CREATE POLICY "Anyone can read suburb boundaries"
ON public.suburb_boundaries
FOR SELECT
USING (true);

-- Service role inserts via edge function (no user INSERT policy needed)
