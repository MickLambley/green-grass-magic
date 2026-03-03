ALTER TABLE public.suburb_boundaries ADD COLUMN postcode text NOT NULL DEFAULT '';
ALTER TABLE public.suburb_boundaries DROP CONSTRAINT suburb_boundaries_suburb_name_state_key;
CREATE UNIQUE INDEX suburb_boundaries_name_state_postcode_idx ON public.suburb_boundaries (suburb_name, state, postcode);