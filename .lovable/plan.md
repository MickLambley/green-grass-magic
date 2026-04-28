## Why the 3 afternoon jobs on 28/04 have no travel time

The optimiser **does** call Google Distance Matrix (latest run logged `matrixCallsMade: 3`, `matrixElementsRequested: 108`, `fallbackPairs: 0`, `usedFallbackDistances: false`), so distances are available. The bug is in how those distances are applied when the day is split into morning/afternoon bands. There are three concrete defects in `supabase/functions/route-optimization/index.ts`:

### Defect 1 — Travel time is dropped between locked anchors and unlocked jobs
`layoutDay()` only adds travel from `lastPlacedId` (the previous *unlocked* job it placed). When an unlocked job is pushed past a locked anchor via `clearsLocked()`, it lands at `lockedAnchor.end` exactly, with **zero travel** added from the anchor. Same problem for the very first unlocked job in the afternoon band — there is no `lastPlacedId`, so it starts at `MIDPOINT` with no travel from whatever job (locked or otherwise) actually precedes it.

### Defect 2 — The afternoon band always restarts at the work-day midpoint
`layoutDay(afternoonOrdered, lockedJobs, dist, MIDPOINT, WORK_END)` ignores when the morning band actually finished. If the morning ends at 11:30 and the afternoon’s `MIDPOINT` is 12:00, the first afternoon job is placed at 12:00 with no travel from the last morning job. More importantly, **inside the afternoon band itself**, travel between consecutive afternoon jobs IS added by `cursor += dist[...]`, but only between unlocked jobs that the function placed sequentially. Any locked anchor in between resets the travel chain (see Defect 1), so a sequence like “unlocked → locked → unlocked” produces back-to-back times across the locked job.

### Defect 3 — “Time saved” is computed against a sequence that ignores travel from anchors too
`totalRouteMinutes()` just sums `dist[a→b]` along a sorted-by-time order, but the `afterOrder` includes locked anchors whose times are fixed. The number reported as “time saved” is meaningful, but the *displayed* schedule still has zero gaps because `layoutDay()` never inserted them.

### What you’re actually seeing on screen
For the 3 jobs after 12pm:
- The afternoon band is solved as a TSP, then laid out starting at `MIDPOINT` (12:00).
- The first afternoon job is placed at 12:00 with **no travel from the morning’s last job**.
- Each subsequent unlocked-after-unlocked transition does add travel — but if any of the three is locked or pushed past a locked anchor, the next job lands at `anchor.end` with no travel. Result: visible back-to-back times.

There is also a secondary issue: `layoutDay` adds travel from `lastPlacedId` *before* checking `clearsLocked`, so when a job is shoved past an anchor the travel addition becomes meaningless (it gets overwritten by `attempt = roundUpTo5(c.pushTo!)`).

---

## Plan to fix

### A. Make `layoutDay` aware of every preceding job
Change the “last placed” tracking to be the **most recent job on the timeline** (locked or unlocked), not just the previous unlocked one. Concretely:

1. Build a single combined timeline as we go: insert locked anchors first as immovable items, then walk the ordered unlocked list and place each one after the latest end time we’ve emitted, plus travel from whichever job (locked or unlocked) is immediately before it.
2. When an unlocked job has to be pushed past a locked anchor, recompute travel using the **anchor as the predecessor**, not the unlocked job we tried to start from.
3. Apply the same rule across the morning→afternoon boundary: the first afternoon job gets `travel(lastMorningJob → firstAfternoonJob)` added on top of `max(MIDPOINT, lastMorningEnd)`.

### B. Stop using a fixed midpoint for the afternoon start
Pass the morning band’s actual end time into the afternoon layout call, and start the afternoon at `max(MIDPOINT, morningEnd + travel)`. The midpoint stays only as a *minimum* for jobs the user explicitly tagged as afternoon.

### C. Fold the morning + afternoon bands into a single layout pass
Right now we solve them as two TSPs and lay them out independently. Cleaner fix:
- Solve morning TSP, solve afternoon TSP.
- Concatenate `[...morningOrdered, ...afternoonOrdered]` and run a **single** `layoutDay` over the whole working day with both bands’ locked anchors present.
- This naturally handles travel across the band boundary and across every locked anchor.

### D. Add a per-leg minimum buffer
Even when Distance Matrix returns a small number for nearby suburbs, jobs need a parking/walk buffer. We already have `roundUpTo5(... + 3)` in the Haversine fallback, but the real Matrix path uses raw `Math.round(seconds / 60)` with no buffer. Add a `MIN_TRAVEL_BUFFER_MIN = 5` floor for any non-zero leg so two jobs on the same street still show a 5-minute gap.

### E. Diagnostics
Add one log line per day summarising the laid-out timeline:
`[route-optimization] day=2026-04-28 layout=[09:00 jobA(60), 10:05 jobB(45), …]` with the travel minutes inserted between each. This makes future “zero gap” reports trivial to confirm from the function logs without re-running.

### F. Verify on test@test.com / 28/04
After deploying:
- Trigger a preview run for contractor `95be33fc-8cf0-40e6-9c7c-e2d51386e8bd`.
- Read the new log line for `2026-04-28` and confirm each consecutive pair on the afternoon has a non-zero travel gap.
- Compare proposed times in the preview dialog with the previous run.

### Files to change
- `supabase/functions/route-optimization/index.ts` — defects A–E (single file).
- No DB migration required.
- No frontend change required; the preview dialog already renders whatever times the function returns.

### Out of scope (suggested follow-ups)
- Persisting per-leg travel time onto the job so it can be displayed in the Jobs timeline UI.
- Honouring a contractor-configurable “minimum buffer between jobs” setting.
