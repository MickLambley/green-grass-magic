/**
 * Schedule conflict detection & auto-shift utility.
 *
 * Given a list of existing jobs on the same day and a new job's
 * desired start time + duration, this determines if there's an
 * overlap and returns the auto-shifted start time if so.
 */

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

interface ExistingSlot {
  id: string;
  scheduled_time: string; // "HH:MM"
  duration_minutes: number;
}

interface ShiftResult {
  shifted: boolean;
  newTime: string;
  message: string;
}

/**
 * Finds the earliest non-overlapping start time for a job.
 * If the desired time doesn't conflict, returns it unchanged.
 * Otherwise auto-shifts to right after the last conflicting job ends,
 * rounded up to the nearest 5 minutes.
 *
 * @param desiredTime   "HH:MM" the contractor wants
 * @param duration      duration in minutes of the new job
 * @param existing      other jobs on the same day (excluding the job being edited)
 * @param endOfDay      latest allowed end time in minutes (default 21:00 = 1260)
 */
export function autoShiftTime(
  desiredTime: string,
  duration: number,
  existing: ExistingSlot[],
  endOfDay = 1260,
): ShiftResult {
  if (!desiredTime || !duration) {
    return { shifted: false, newTime: desiredTime, message: "" };
  }

  const desiredStart = timeToMinutes(desiredTime);
  const desiredEnd = desiredStart + duration;

  // Sort existing by start time
  const sorted = [...existing]
    .filter((e) => e.scheduled_time)
    .map((e) => ({
      start: timeToMinutes(e.scheduled_time),
      end: timeToMinutes(e.scheduled_time) + (e.duration_minutes || 60),
      id: e.id,
    }))
    .sort((a, b) => a.start - b.start);

  // Check for overlaps with the desired window
  const hasConflict = sorted.some(
    (s) => desiredStart < s.end && desiredEnd > s.start,
  );

  if (!hasConflict) {
    return { shifted: false, newTime: desiredTime, message: "" };
  }

  // Find the first gap that fits this job's duration
  let candidate = desiredStart;
  for (const slot of sorted) {
    if (candidate + duration <= slot.start) {
      // Gap before this slot fits
      break;
    }
    // Push past this slot
    if (candidate < slot.end) {
      candidate = slot.end;
    }
  }

  // Round up to nearest 5 minutes
  candidate = Math.ceil(candidate / 5) * 5;

  if (candidate + duration > endOfDay) {
    return {
      shifted: true,
      newTime: minutesToTime(candidate),
      message: "Job shifted but may extend past working hours.",
    };
  }

  return {
    shifted: true,
    newTime: minutesToTime(candidate),
    message: `Scheduling conflict detected — job auto-shifted to ${minutesToTime(candidate)}.`,
  };
}
