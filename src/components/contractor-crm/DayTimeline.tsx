import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Clock, Car, ChevronLeft, ChevronRight } from "lucide-react";
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
}

interface DayTimelineProps {
  jobs: TimelineJob[];
  date: Date;
  onDateChange: (date: Date) => void;
  onJobClick?: (job: TimelineJob) => void;
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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
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

const DayTimeline = ({ jobs, date, onDateChange, onJobClick }: DayTimelineProps) => {
  // Sort jobs by scheduled_time, filter to ones with times
  const sortedJobs = useMemo(() => {
    return [...jobs]
      .filter((j) => j.scheduled_time && j.status !== "cancelled")
      .sort((a, b) => {
        const aMin = timeToMinutes(a.scheduled_time!);
        const bMin = timeToMinutes(b.scheduled_time!);
        return aMin - bMin;
      });
  }, [jobs]);

  // Calculate travel gaps between consecutive jobs
  const entries = useMemo(() => {
    const result: {
      type: "job" | "travel";
      job?: typeof sortedJobs[0];
      startMinutes: number;
      durationMinutes: number;
      travelMinutes?: number;
    }[] = [];

    for (let i = 0; i < sortedJobs.length; i++) {
      const job = sortedJobs[i];
      const startMin = timeToMinutes(job.scheduled_time!);
      const duration = job.duration_minutes || 60;

      result.push({ type: "job", job, startMinutes: startMin, durationMinutes: duration });

      // Calculate gap to next job
      if (i < sortedJobs.length - 1) {
        const endMin = startMin + duration;
        const nextStart = timeToMinutes(sortedJobs[i + 1].scheduled_time!);
        const gap = nextStart - endMin;
        if (gap > 0) {
          result.push({ type: "travel", startMinutes: endMin, durationMinutes: gap, travelMinutes: gap });
        }
      }
    }

    return result;
  }, [sortedJobs]);

  // Timeline bounds
  const timelineBounds = useMemo(() => {
    if (sortedJobs.length === 0) return { startHour: 7, endHour: 17 };
    const firstStart = timeToMinutes(sortedJobs[0].scheduled_time!);
    const lastJob = sortedJobs[sortedJobs.length - 1];
    const lastEnd = timeToMinutes(lastJob.scheduled_time!) + (lastJob.duration_minutes || 60);
    return {
      startHour: Math.floor(firstStart / 60),
      endHour: Math.min(Math.ceil(lastEnd / 60) + 1, 24),
    };
  }, [sortedJobs]);

  const totalHours = timelineBounds.endHour - timelineBounds.startHour;
  const hourLabels = Array.from({ length: totalHours + 1 }, (_, i) => timelineBounds.startHour + i);

  // Calculate position and height as percentages of the timeline
  const totalMinutes = totalHours * 60;
  const getTop = (minutes: number) => ((minutes - timelineBounds.startHour * 60) / totalMinutes) * 100;
  const getHeight = (duration: number) => (duration / totalMinutes) * 100;

  const cancelledJobs = jobs.filter(j => j.status === "cancelled");

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
        {sortedJobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No scheduled jobs for this day
          </div>
        ) : (
          <div className="relative" style={{ minHeight: `${Math.max(totalHours * 64, 300)}px` }}>
            {/* Hour gridlines */}
            {hourLabels.map((hour) => {
              const top = getTop(hour * 60);
              return (
                <div key={hour} className="absolute left-0 right-0" style={{ top: `${top}%` }}>
                  <div className="flex items-start">
                    <span className="text-[10px] text-muted-foreground w-12 -mt-1.5 text-right pr-2 shrink-0">
                      {hour === 0 ? "12 AM" : hour <= 12 ? `${hour} ${hour < 12 ? "AM" : "PM"}` : `${hour - 12} PM`}
                    </span>
                    <div className="flex-1 border-t border-border/50" />
                  </div>
                </div>
              );
            })}

            {/* Timeline entries */}
            <div className="ml-14 relative" style={{ minHeight: `${Math.max(totalHours * 64, 300)}px` }}>
              {entries.map((entry, idx) => {
                const top = getTop(entry.startMinutes);
                const height = getHeight(entry.durationMinutes);
                const minPx = entry.type === "job" ? 48 : 24;

                if (entry.type === "travel") {
                  return (
                    <div
                      key={`travel-${idx}`}
                      className="absolute left-2 right-2 flex items-center justify-center"
                      style={{ top: `${top}%`, height: `max(${height}%, ${minPx}px)` }}
                    >
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border border-dashed border-border">
                        <Car className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {formatDuration(entry.travelMinutes!)} travel
                        </span>
                      </div>
                    </div>
                  );
                }

                const job = entry.job!;
                const colors = statusColors[job.status] || statusColors.scheduled;
                const startTime = job.scheduled_time!;
                const endMinutes = entry.startMinutes + entry.durationMinutes;
                const endH = Math.floor(endMinutes / 60);
                const endM = endMinutes % 60;
                const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

                return (
                  <div
                    key={job.id}
                    className={`absolute left-1 right-1 rounded-lg border-l-4 ${colors.border} ${colors.bg} px-3 py-2 cursor-pointer hover:shadow-md transition-shadow overflow-hidden`}
                    style={{ top: `${top}%`, minHeight: `max(${height}%, ${minPx}px)` }}
                    onClick={() => onJobClick?.(job)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground truncate">{job.title}</span>
                          {job.source === "platform" && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 shrink-0">🌐</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{job.client_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-semibold text-foreground">{startTime}</p>
                        <p className="text-[10px] text-muted-foreground">→ {endTime}</p>
                      </div>
                    </div>
                    {entry.durationMinutes >= 30 && (
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
                    )}
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
          </div>
        )}

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
