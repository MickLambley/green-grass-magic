import { useMemo, useRef, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Clock, Car, ChevronLeft, ChevronRight, GripVertical, ChevronDown, ChevronUp, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addDays, subDays, isToday, isTomorrow, isYesterday } from "date-fns";

interface TimelineJob {
  id: string;
  title: string;
  client_name: string;
  scheduled_time: string | null;
  duration_minutes: number | null;
  status: string;
  source: "crm" | "platform";
  client_address?: { street?: string; city?: string; state?: string; postcode?: string } | null;
  original_scheduled_time?: string | null;
}

interface WorkingHoursRange {
  start: string;
  end: string;
}

interface DayTimelineProps {
  jobs: TimelineJob[];
  date: Date;
  onDateChange: (date: Date) => void;
  onJobClick?: (job: TimelineJob) => void;
  onJobReschedule?: (jobId: string, newTime: string, source: "crm" | "platform") => void;
  workingHours?: WorkingHoursRange | null;
}

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  scheduled: { bg: "bg-sky/10", border: "border-sky/40", text: "text-sky" },
  in_progress: { bg: "bg-sunshine/10", border: "border-sunshine/40", text: "text-sunshine" },
  completed: { bg: "bg-primary/10", border: "border-primary/40", text: "text-primary" },
  cancelled: { bg: "bg-destructive/10", border: "border-destructive/40", text: "text-destructive" },
  pending: { bg: "bg-sunshine/10", border: "border-sunshine/40", text: "text-sunshine" },
  confirmed: { bg: "bg-sky/10", border: "border-sky/40", text: "text-sky" },
  pending_confirmation: { bg: "bg-sunshine/10", border: "border-sunshine/40", text: "text-sunshine" },
};

// Pixels per hour — large enough so 15-min jobs get ~30px
const PX_PER_HOUR = 120;
// Minimum travel buffer in minutes — gaps shorter than this between different-address jobs get flagged
const MIN_TRAVEL_BUFFER = 15;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateLabel(date: Date): string {
  if (isToday(date)) return `Today — ${format(date, "EEEE, d MMM")}`;
  if (isTomorrow(date)) return `Tomorrow — ${format(date, "EEEE, d MMM")}`;
  if (isYesterday(date)) return `Yesterday — ${format(date, "EEEE, d MMM")}`;
  return format(date, "EEEE, d MMMM yyyy");
}

function snapTo15(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

const DayTimeline = ({ jobs, date, onDateChange, onJobClick, onJobReschedule, workingHours }: DayTimelineProps) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropPreviewMinutes, setDropPreviewMinutes] = useState<number | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const sortedJobs = useMemo(() => {
    return [...jobs]
      .filter((j) => j.scheduled_time && j.status !== "cancelled")
      .sort((a, b) => timeToMinutes(a.scheduled_time!) - timeToMinutes(b.scheduled_time!));
  }, [jobs]);

  const entries = useMemo(() => {
    const result: {
      type: "job" | "travel";
      job?: typeof sortedJobs[0];
      startMinutes: number;
      durationMinutes: number;
      travelMinutes?: number;
      travelWarning?: boolean;
    }[] = [];

    for (let i = 0; i < sortedJobs.length; i++) {
      const job = sortedJobs[i];
      const startMin = timeToMinutes(job.scheduled_time!);
      const duration = job.duration_minutes || 60;
      result.push({ type: "job", job, startMinutes: startMin, durationMinutes: duration });

      if (i < sortedJobs.length - 1) {
        const endMin = startMin + duration;
        const nextStart = timeToMinutes(sortedJobs[i + 1].scheduled_time!);
        const gap = nextStart - endMin;
        // Check if different addresses (i.e., travel is needed)
        const currentAddr = job.client_address;
        const nextAddr = sortedJobs[i + 1].client_address;
        const sameAddress = currentAddr?.street && nextAddr?.street && currentAddr.street === nextAddr.street;
        const needsTravel = !sameAddress && (currentAddr?.street || nextAddr?.street);
        const travelWarning = !!needsTravel && gap < MIN_TRAVEL_BUFFER && gap >= 0;
        
        if (gap > 0) {
          result.push({ type: "travel", startMinutes: endMin, durationMinutes: gap, travelMinutes: gap, travelWarning });
        } else if (gap <= 0 && needsTravel) {
          // Overlapping jobs that need travel — insert a warning-only travel entry
          result.push({ type: "travel", startMinutes: endMin, durationMinutes: 0, travelMinutes: 0, travelWarning: true });
        }
      }
    }
    return result;
  }, [sortedJobs]);

  // Build a set of job IDs that have travel warnings (adjacent to a warning travel entry)
  const travelWarningJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].type === "travel" && entries[i].travelWarning) {
        // Flag the job before and after this travel entry
        if (i > 0 && entries[i - 1].type === "job" && entries[i - 1].job) {
          ids.add(entries[i - 1].job!.id);
        }
        if (i < entries.length - 1 && entries[i + 1].type === "job" && entries[i + 1].job) {
          ids.add(entries[i + 1].job!.id);
        }
      }
    }
    return ids;
  }, [entries]);

  const timelineBounds = useMemo(() => {
    let startHour = 7;
    let endHour = 17;
    if (workingHours) {
      startHour = Math.floor(timeToMinutes(workingHours.start) / 60);
      endHour = Math.ceil(timeToMinutes(workingHours.end) / 60);
    }
    if (sortedJobs.length > 0) {
      const firstStart = timeToMinutes(sortedJobs[0].scheduled_time!);
      const lastJob = sortedJobs[sortedJobs.length - 1];
      const lastEnd = timeToMinutes(lastJob.scheduled_time!) + (lastJob.duration_minutes || 60);
      startHour = Math.min(startHour, Math.floor(firstStart / 60));
      endHour = Math.max(endHour, Math.min(Math.ceil(lastEnd / 60) + 1, 24));
    }
    return { startHour, endHour };
  }, [sortedJobs, workingHours]);

  const totalHours = timelineBounds.endHour - timelineBounds.startHour;
  const totalPx = totalHours * PX_PER_HOUR;
  const hourLabels = Array.from({ length: totalHours + 1 }, (_, i) => timelineBounds.startHour + i);

  // Convert minutes to pixel offset
  const getTopPx = (minutes: number) => ((minutes - timelineBounds.startHour * 60) / 60) * PX_PER_HOUR;
  const getHeightPx = (duration: number) => (duration / 60) * PX_PER_HOUR;

  const yToMinutes = useCallback((y: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, y / rect.height));
    const totalMinutes = totalHours * 60;
    return snapTo15(timelineBounds.startHour * 60 + pct * totalMinutes);
  }, [timelineBounds, totalHours]);

  const handleDragStart = useCallback((e: React.DragEvent, job: TimelineJob) => {
    if (job.status === "completed" || job.status === "cancelled") {
      e.preventDefault();
      return;
    }
    setDragJobId(job.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", job.id);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDragJobId(null);
    setDropPreviewMinutes(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDropPreviewMinutes(yToMinutes(y));
  }, [yToMinutes]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("text/plain");
    if (!jobId || !timelineRef.current || !onJobReschedule) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const newMinutes = yToMinutes(y);
    const newTime = minutesToTime(newMinutes);

    const job = jobs.find(j => j.id === jobId);
    if (job) {
      onJobReschedule(jobId, newTime, job.source);
    }

    setDragJobId(null);
    setDropPreviewMinutes(null);
  }, [yToMinutes, onJobReschedule, jobs]);

  const cancelledJobs = jobs.filter(j => j.status === "cancelled");
  const isDraggable = !!onJobReschedule;

  // A job is "short" if it would render less than 48px tall
  const isShortJob = (durationMinutes: number) => getHeightPx(durationMinutes) < 48;

  const handleJobCardClick = (job: TimelineJob, durationMinutes: number) => {
    if (isShortJob(durationMinutes)) {
      // Toggle expand for short jobs
      setExpandedJobId(prev => prev === job.id ? null : job.id);
    } else {
      onJobClick?.(job);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => onDateChange(subDays(date, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <CardTitle className="font-display text-base text-center">
            {formatDateLabel(date)}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => onDateChange(addDays(date, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-4">
        {workingHours === null && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Day off — not a working day
          </div>
        )}

        {workingHours !== null && sortedJobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No scheduled jobs for this day
          </div>
        ) : workingHours !== null ? (
          <div className="relative" style={{ height: `${totalPx}px` }}>
            {/* Working hours shaded background */}
            {workingHours && (() => {
              const whStart = timeToMinutes(workingHours.start);
              const whEnd = timeToMinutes(workingHours.end);
              const top = getTopPx(whStart);
              const height = getHeightPx(whEnd - whStart);
              return (
                <div
                  className="absolute right-0 rounded-md bg-primary/[0.04] border border-primary/10"
                  style={{ top: `${top}px`, height: `${height}px`, left: "3.5rem" }}
                >
                  <span className="absolute -left-0.5 top-0 -translate-x-full text-[9px] text-primary/50 font-medium whitespace-nowrap">
                    Start
                  </span>
                  <span className="absolute -left-0.5 bottom-0 -translate-x-full text-[9px] text-primary/50 font-medium whitespace-nowrap">
                    End
                  </span>
                </div>
              );
            })()}

            {/* Hour gridlines */}
            {hourLabels.map((hour) => {
              const top = getTopPx(hour * 60);
              return (
                <div key={hour} className="absolute left-0 right-0" style={{ top: `${top}px` }}>
                  <div className="flex items-start">
                    <span className="text-[10px] text-muted-foreground w-12 -mt-1.5 text-right pr-2 shrink-0">
                      {formatHourLabel(hour)}
                    </span>
                    <div className="flex-1 border-t border-border/50" />
                  </div>
                </div>
              );
            })}

            {/* Drop preview indicator */}
            {dragJobId && dropPreviewMinutes !== null && (
              <div
                className="absolute left-14 right-2 h-0.5 bg-primary rounded-full z-30 pointer-events-none"
                style={{ top: `${getTopPx(dropPreviewMinutes)}px` }}
              >
                <span className="absolute -left-1 -top-2.5 text-[9px] font-bold text-primary bg-background px-1 rounded">
                  {minutesToTime(dropPreviewMinutes)}
                </span>
              </div>
            )}

            {/* Timeline entries */}
            <div
              ref={timelineRef}
              className="ml-14 relative"
              style={{ height: `${totalPx}px` }}
              onDragOver={isDraggable ? handleDragOver : undefined}
              onDrop={isDraggable ? handleDrop : undefined}
            >
              {entries.map((entry, idx) => {
                const topPx = getTopPx(entry.startMinutes);
                const heightPx = getHeightPx(entry.durationMinutes);

                if (entry.type === "travel") {
                  const isShortTravel = heightPx < 24;
                  const hasWarning = !!entry.travelWarning;
                  return (
                    <div
                      key={`travel-${idx}`}
                      className={`absolute left-2 right-2 flex items-center justify-center transition-opacity pointer-events-none ${dragJobId ? "opacity-30" : ""}`}
                      style={{
                        top: `${topPx}px`,
                        height: isShortTravel ? "22px" : `${Math.max(heightPx, 20)}px`,
                        zIndex: isShortTravel ? 12 : 5,
                      }}
                    >
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed ${
                        hasWarning
                          ? "bg-destructive/10 border-destructive/40"
                          : "bg-muted/80 border-border"
                      } ${isShortTravel ? "shadow-sm" : ""}`}>
                        {hasWarning && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                        <Car className={`w-3 h-3 shrink-0 ${hasWarning ? "text-destructive" : "text-muted-foreground"}`} />
                        <span className={`text-[10px] font-medium whitespace-nowrap ${hasWarning ? "text-destructive" : "text-muted-foreground"}`}>
                          {entry.travelMinutes! > 0 ? formatDuration(entry.travelMinutes!) : "Overlap!"}
                        </span>
                      </div>
                    </div>
                  );
                }

                const job = entry.job!;
                const colors = statusColors[job.status] || statusColors.scheduled;
                const startTime = job.scheduled_time!;
                const endMinutes = entry.startMinutes + entry.durationMinutes;
                const endTime = minutesToTime(endMinutes);
                const canDrag = isDraggable && job.status !== "completed" && job.status !== "cancelled";
                const isBeingDragged = dragJobId === job.id;
                const short = isShortJob(entry.durationMinutes);
                const isExpanded = expandedJobId === job.id;
                const wasShifted = !!job.original_scheduled_time && job.original_scheduled_time !== startTime;
                const originalTopPx = wasShifted ? getTopPx(timeToMinutes(job.original_scheduled_time!)) : 0;
                const hasTravelWarning = travelWarningJobIds.has(job.id);

                return (
                  <div key={job.id}>
                    {/* Ghost marker at original time when job was auto-shifted */}
                    {wasShifted && (
                      <div
                        className="absolute left-1 right-1 rounded-lg border-2 border-dashed border-amber-400/40 bg-amber-500/5 pointer-events-none z-[5]"
                        style={{
                          top: `${originalTopPx}px`,
                          height: `${Math.max(getHeightPx(entry.durationMinutes), 28)}px`,
                        }}
                      >
                        <span className="absolute top-0.5 left-2 text-[9px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          Originally {job.original_scheduled_time} <ArrowRight className="w-2.5 h-2.5" /> {startTime}
                        </span>
                      </div>
                    )}
                    <div
                      draggable={canDrag}
                      onDragStart={canDrag ? (e) => handleDragStart(e, job) : undefined}
                      onDragEnd={canDrag ? handleDragEnd : undefined}
                      className={`absolute left-1 right-1 rounded-lg border-l-4 ${colors.border} ${colors.bg} cursor-pointer hover:shadow-md transition-all overflow-hidden ${
                        canDrag ? "cursor-grab active:cursor-grabbing" : ""
                      } ${isBeingDragged ? "opacity-50 shadow-lg ring-2 ring-primary/30" : ""} ${wasShifted ? "ring-1 ring-amber-400/30" : ""} ${
                        hasTravelWarning ? "ring-2 ring-destructive/50 border-l-destructive" : ""
                      }`}
                      style={{
                        top: `${topPx}px`,
                        height: isExpanded ? "auto" : `${Math.max(heightPx, 28)}px`,
                        minHeight: isExpanded ? `${Math.max(heightPx, 28)}px` : undefined,
                        zIndex: isExpanded ? 25 : isBeingDragged ? 20 : 10,
                      }}
                      onClick={() => !isBeingDragged && handleJobCardClick(job, entry.durationMinutes)}
                    >
                    {/* Compact layout for short jobs */}
                    {short && !isExpanded ? (
                      <div className="flex items-center gap-2 px-2 py-1 h-full">
                        {hasTravelWarning && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                        {canDrag && <GripVertical className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                        <span className="text-[10px] font-bold text-foreground truncate">{job.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{startTime}–{endTime}</span>
                        <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0 ml-auto" />
                      </div>
                    ) : (
                      <div className="px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 flex items-start gap-1.5">
                            {hasTravelWarning && (
                              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                            )}
                            {canDrag && (
                              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-foreground truncate">{job.title}</span>
                                {job.source === "platform" && (
                                  <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">🌐</Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">{job.client_name}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-semibold text-foreground">{startTime}</p>
                            <p className="text-[10px] text-muted-foreground">→ {endTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(entry.durationMinutes)}
                          </span>
                          {job.client_address?.street && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{job.client_address.street}</span>
                            </span>
                          )}
                        </div>
                        {short && isExpanded && (
                          <div className="flex justify-center mt-1">
                            <ChevronUp className="w-3 h-3 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-4 ml-14 flex items-center gap-4 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{sortedJobs.length}</span> job{sortedJobs.length !== 1 ? "s" : ""}
              </span>
              {entries.filter(e => e.type === "travel").length > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Car className="w-3 h-3" />
                  {formatDuration(entries.filter(e => e.type === "travel").reduce((sum, e) => sum + (e.travelMinutes || 0), 0))} travel
                </span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(entries.filter(e => e.type === "job").reduce((sum, e) => sum + e.durationMinutes, 0))} work
              </span>
            </div>

            {isDraggable && (
              <p className="text-[10px] text-muted-foreground/60 ml-14 mt-1">
                Drag jobs to reschedule · Snaps to 15-min intervals
              </p>
            )}
          </div>
        ) : null}

        {cancelledJobs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground mb-1">{cancelledJobs.length} cancelled</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DayTimeline;
