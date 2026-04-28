## Diagnosis: Why Route Optimisation Produces Bad Routes

Reading `supabase/functions/route-optimization/index.ts` end-to-end uncovered several real bugs that explain both symptoms — "no travel time between jobs" and "obviously not the best route".

### Bug 1 — Distance Matrix batching is broken (most important)

In `fetchDistancesForJobs` (lines 397–404):

```ts
const BATCH_SIZE = 10;
for (let i = 0; i < locations.length; i += BATCH_SIZE) {
  const originBatch = locations.slice(i, i + BATCH_SIZE);
  const distances = await getDistanceMatrix(originBatch, locations); // <-- ALL destinations
}
```

Google Distance Matrix limits each request to 10 origins × 10 destinations (max 100 elements). When a contractor has > 10 jobs in a day, every call sends 10 × N destinations. Google rejects the request (`MAX_ELEMENTS_EXCEEDED` / `MAX_DIMENSIONS_EXCEEDED`), `data.status !== "OK"`, the function flips `usedFallbackDistances = true` and silently substitutes Haversine straight-line estimates at a flat **40 km/h**. That estimate ignores roads, water (Lake Macquarie!), and traffic — straight-line across the lake is meaningless, which is exactly the "clearly not the best route" symptom.

### Bug 2 — Travel time is dropped from the optimised order

`calculateTotalTravelTime` (line 182) sums raw minutes, but `calculateSequentialTimes` (line 101) uses `roundUpTo5(travelMinutes)` when scheduling — and `optimizeRoute` only minimises raw minutes. More critically, when fallback distances aren't populated for a pair, `getTravelMinutes` returns `0` (line 76). That's why jobs end up scheduled back-to-back with no gap: missing matrix entries silently become zero travel time.

### Bug 3 — Nearest-neighbour with a fixed starting job

`optimizeRoute` (line 190) always starts from `jobIds[0]` — i.e. whatever order the DB returned. Nearest-neighbour from an arbitrary start is known to produce routes 25%+ worse than optimal and is highly sensitive to the start point. There is no 2-opt improvement pass.

### Bug 4 — Morning/afternoon split throws away optimisation freedom

Time-restricted jobs are siloed into morning/afternoon groups using a midpoint cutoff inferred from `scheduled_time`, but jobs with `null` time were just defaulted to `work_start` 10 lines earlier — so every previously-untimed job is forced into "morning". Then the morning group is optimised in isolation and the afternoon group separately, which usually produces bad cross-overs.

### Bug 5 — Distance Matrix uses unweighted addresses, no `region=au`

Free-text addresses like "12 Smith St, Belmont" are ambiguous globally. Without `&region=au` and `&components=country:AU`, Google sometimes geocodes to the wrong country/state and returns a nonsensical duration. There is also no `departure_time` parameter, so traffic-aware routing is never used.

### Bug 6 — Address normalisation is too lax

The address validator accepts a job if it has a street **and** (city OR postcode). A street + city alone (no state, no postcode) routinely geocodes to the wrong suburb. Distance Matrix then returns a coherent but wrong duration, so the API call succeeds (no fallback flag) yet the route is still wrong.

### Bug 7 — Locked jobs don't anchor the route

`lockedJobs` are extracted (line 468) but never inserted back into the optimisation. Their fixed times aren't used as anchors when sequencing the unlocked jobs, so the engine can compute a sequence that overlaps a locked job.

---

## Plan

### Part A — Fix the Distance Matrix layer

1. Batch correctly: split BOTH origins AND destinations into ≤10 chunks; loop `i` over origin batches and `j` over destination batches so every call is ≤ 10×10 = 100 elements.
2. Add `&region=au&components=country:AU&units=metric&mode=driving` to every Distance Matrix and Geocoding call.
3. Add `&departure_time=now&traffic_model=best_guess` for traffic-aware durations on same-day requests (use `duration_in_traffic` when present).
4. Treat any missing `from->to` pair as a hard failure for that pair (NOT zero) — fall back to Haversine for just the missing pair, and log it. Never let a `0` slip through unless `from === to`.
5. Cache geocodes per address inside one optimisation run to avoid re-geocoding.

### Part B — Build a proper TSP solver

1. Replace single-start nearest-neighbour with **multi-start nearest-neighbour** (try every job as start) + **2-opt local search** until no improvement. For ≤ 12 jobs this is near-optimal and runs in milliseconds.
2. Use the asymmetric distance matrix (Google returns asymmetric durations due to one-way streets) — compute travel both directions instead of assuming symmetry.
3. Score by total **clock time** (travel + service durations, rounded to 5 min like the scheduler), not just travel.

### Part C — Respect anchors and time windows

1. Treat `route_optimization_locked` jobs as fixed pins. Insert them at their `scheduled_time` and optimise the *unlocked* jobs into the gaps.
2. Replace the morning/afternoon midpoint heuristic with explicit time windows from `time_flexibility`:
   - `flexible`: window = `[work_start, work_end]`
   - `time_restricted`: keep job's existing slot's window (parse the slot label or fall back to current `scheduled_time ± 1 h`).
3. Reject sequences that violate windows or overrun `work_end` and surface them as "needs your attention" rather than silently shifting.

### Part D — Tighten address validation

1. Require street **AND** state **AND** (city OR postcode). Anything weaker is reported via the existing `MissingAddressesDialog` flow.
2. Geocode every job once at the start of a run; store lat/lng on the in-memory job object. If a geocode falls outside AU bounds, treat the address as invalid.

### Part E — Observability so future regressions are caught

1. Log per-day: `{ jobsCount, matrixCallsMade, matrixElementsRequested, fallbackPairs, totalTravelBefore, totalTravelAfter }`.
2. Surface `usedFallbackDistances` and `fallbackPairs` in the API response so the preview dialog can warn "estimated travel times — Google Maps quota exceeded or address ambiguous".

### Part F — Verify on the seeded Lake Macquarie data

1. Run preview optimisation for `test@test.com` for tomorrow.
2. Confirm: (a) Distance Matrix is called in proper 10×10 batches, (b) no zero travel times appear between distinct addresses, (c) the optimised route doesn't cross the lake when a road route exists, (d) no overlaps with locked jobs.

### Files

- `supabase/functions/route-optimization/index.ts` — all engine fixes (single file).
- `src/components/contractor-crm/OptimizationPreviewDialog.tsx` — show fallback warning + per-leg travel minutes (read-only verification).
- `src/components/contractor-crm/MissingAddressesDialog.tsx` — copy update for stricter validation.

### Out of scope (call out, don't build now)

- Switching to Google **Routes API** (replacement for Distance Matrix, supports up to 625 elements/call and better traffic) — bigger lift, propose as a follow-up if quota becomes an issue.
- True VRP solver with vehicle capacity / multi-day balancing — current "Level 2" multi-day reshuffle is naive; flag for a later iteration.
