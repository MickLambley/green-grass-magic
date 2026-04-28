# Fix Route Optimisation "Address Error"

## Diagnosis

Sarah Mitchell's address is fine (`14 Ocean Park Road, Belmont, NSW 2280`). She passes the strict validator. The failure happens in the **geocoding step**, which then reports back through the same dialog with the misleading "address error" wording.

Underlying cause: `supabase/functions/route-optimization/index.ts` is calling Google's Geocoding and Distance Matrix APIs with a key that has **HTTP referer restrictions** (the browser key used for Places Autocomplete). Server-side calls return:

```
REQUEST_DENIED — "API keys with referer restrictions cannot be used with this API."
```

Every job fails geocoding, and whichever client appears first in the batch (currently Sarah) gets surfaced as the offender.

A second, unrelated data issue: client **Sarah Johnson** has her whole address jammed into the `street` field with no `city`/`state`/`postcode` — a real validation failure.

## Changes

### 1. Add a server-side Google Maps key (manual step)
Create a **second** Google Maps API key in Google Cloud Console with:
- **Application restrictions:** None (or IP-restricted to Supabase egress)
- **API restrictions:** Geocoding API + Distance Matrix API

Store it as the Supabase secret `GOOGLE_MAPS_API_KEY` (overwriting the current value, which is a copy of the browser key). Keep `VITE_GOOGLE_MAPS_API_KEY` as the existing referer-restricted browser key for Places Autocomplete.

The edge function already prefers `GOOGLE_MAPS_API_KEY` over the VITE one, so no code change is needed once the secret is updated.

### 2. Improve error reporting in the edge function
Currently a `REQUEST_DENIED` from Google is silently swallowed and reported as a missing address. Update `geocodeAU()` and `distanceMatrixBatch()` in `supabase/functions/route-optimization/index.ts` to:
- Detect Google `status === "REQUEST_DENIED"` (or any non-OK status) and surface it as a distinct top-level error: `{ error: "geocoding_unavailable", message: "Map service is temporarily unavailable — please contact support" }`.
- Stop labelling such failures as "missing addresses" so contractors don't waste time editing valid records.

Show this new error in `OptimizationPreviewDialog` (and the trigger flow) as a red banner instead of opening `MissingAddressesDialog`.

### 3. Clean up the malformed client record
Run a one-off migration to split Sarah Johnson's address (`"12 Gum Tree Rd, Brisbane QLD 4001"`) into proper fields:
```json
{ "street": "12 Gum Tree Rd", "city": "Brisbane", "state": "QLD", "postcode": "4001" }
```

### 4. Optional hardening
Add a quick startup self-test in the edge function: on first call, geocode a known address (e.g. "Sydney, NSW") and cache the result. If it fails, return the new `geocoding_unavailable` error immediately instead of looping over every job.

## Files affected
- `supabase/functions/route-optimization/index.ts` — better error propagation from `geocodeAU` / `distanceMatrixBatch`, optional self-test.
- `src/components/contractor-crm/OptimizationPreviewDialog.tsx` (and the JobsTab trigger) — handle the new `geocoding_unavailable` error code.
- New migration to fix the one malformed client address.
- Supabase secret `GOOGLE_MAPS_API_KEY` updated manually (no code change).

## Out of scope
- Replacing Google Maps with another provider.
- Re-running optimisation automatically after the secret is fixed (contractor can retry).
