# Diagnosis

Route optimisation is no longer failing because Sarah Mitchell’s address is invalid, and the server-side map key appears to be working now.

What I found:

- The backend function has successfully run multiple times for the seeded contractor with Sarah Mitchell and 18 jobs in the next 3 days.
- Recent route optimisation logs show clean runs:
  - `geocodeCalls: 19`
  - `matrixCallsMade: 3`
  - `fallbackPairs: 0`
  - `apiErrors: []`
  - proposed route changes were generated.
- Sarah Mitchell’s address geocodes successfully:
  - `14 Ocean Park Road, Belmont, NSW 2280` resolves to a valid Australian location.
- The currently logged-in preview contractor, `John's Lawn Care`, has no eligible jobs in the next 3 days, so their run returns “No eligible jobs found”, not a map service error.
- The exact message “Map service became unavailable while running optimisation” can only be returned when the pre-flight map check passes, but one of the later per-job geocode calls returns an API/system failure.

Most likely cause:

The current implementation treats any transient geocoding status such as `UNKNOWN_ERROR`, `OVER_QUERY_LIMIT`, network hiccup, or temporary JSON/fetch issue as a hard failure. There is no retry/backoff, no per-address diagnostic logging before early return, and no saved lat/lng cache on clients. So a single temporary Google geocoding blip can abort the entire optimisation run with a vague “Map service became unavailable” message.

# Plan

## 1. Add robust map API diagnostics

Update the route optimisation backend function to log structured diagnostics before every early map-service failure:

- contractor id
- stage: `preflight`, `job_geocode`, or `distance_matrix`
- address being geocoded, redacted enough for safety but useful for debugging
- Google status and error message
- HTTP status
- whether the failure is retryable or configuration-related

This will make the next failure identify the exact address/status instead of showing a generic toast.

## 2. Retry transient geocoding failures

Change geocoding so retryable failures do not immediately abort the run.

Retryable:

- `UNKNOWN_ERROR`
- temporary fetch/network failures
- HTTP 5xx
- possibly rate-limit-style temporary failures with short backoff

Non-retryable:

- `REQUEST_DENIED`
- invalid/missing key
- billing/API-not-enabled errors
- clearly invalid address results

Behaviour:

- Try each geocode up to 3 times with short backoff.
- Only return `geocoding_unavailable` after retries are exhausted.
- Return a more specific message if the failure is configuration/quota related.

## 3. Stop aborting the entire route where safe

For Distance Matrix failures, the code already falls back to estimated travel times. I will extend the same resilience where possible:

- If an address already has valid stored coordinates, skip geocoding.
- If geocoding for one address has a transient failure after retries, report that address specifically instead of blaming the whole map service when appropriate.
- Keep hard-failing only for actual map service configuration problems.

## 4. Persist geocoded coordinates on client records

Add a backend-safe coordinate cache for client addresses:

- Store `lat` and `lng` inside the existing address JSON after successful geocoding.
- Reuse stored coordinates on future optimisation runs.
- Invalidate/re-geocode when the address fields change.

This reduces calls, avoids quota pressure, and prevents transient geocoding failures from breaking future runs.

## 5. Improve frontend error messages

Update both route optimisation entry points so errors are clear:

- If no eligible jobs exist: show “No scheduled/in-progress jobs in the next 3 days.”
- If a map service configuration problem occurs: show “Map routing is not configured correctly.”
- If Google is temporarily unavailable after retries: show “Map service is temporarily unavailable. Please retry in a minute.”
- If a specific address cannot be geocoded: show the existing address-fix dialog with that client/job.

Also surface a small “technical details” line in development/test mode so we can see `REQUEST_DENIED`, `OVER_QUERY_LIMIT`, or `UNKNOWN_ERROR` without digging through logs.

## 6. Fix stale/ambiguous UI paths

There are multiple route optimisation buttons:

- Jobs page banner
- Jobs page toolbar
- Timeline button
- Scheduling tab button

I will make them all use the same central handler and the same error handling so one path does not show outdated behaviour.

# Files to update

- `supabase/functions/route-optimization/index.ts`
  - retry/backoff
  - better error classification
  - structured diagnostics
  - coordinate caching
- `src/pages/ContractorDashboard.tsx`
  - handle `geocoding_unavailable`, `missing_addresses`, and no-jobs responses consistently
- `src/components/contractor-crm/JobsTab.tsx`
  - align route optimisation handling with dashboard-level handler
- `src/components/contractor-crm/OptimizationPreviewDialog.tsx`
  - display fallback/diagnostic warnings more clearly if needed

# Expected result

Route optimisation should no longer fail because of a single transient map API hiccup. If it still cannot run, the app will identify whether the issue is:

- no eligible jobs,
- a specific bad address,
- temporary map API failure,
- quota/billing/API configuration,
- or a real backend error.

That will make future failures actionable instead of the current vague “Map service became unavailable” message.