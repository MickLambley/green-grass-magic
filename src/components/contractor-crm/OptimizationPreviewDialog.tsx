import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight, MapPin, Loader2, Check, X, AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";

interface ProposedChange {
  jobId: string;
  title: string;
  clientName: string;
  date: string;
  currentTime: string | null;
  newTime: string;
}

interface OverflowJob {
  jobId: string;
  title: string;
  clientName: string;
  date: string;
}

interface OptimizationPreview {
  timeSaved: number;
  proposedChanges: ProposedChange[];
  message?: string;
  usedFallbackDistances?: boolean;
  fallbackPairs?: number;
  overflowJobs?: OverflowJob[];
}

interface OptimizationPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: OptimizationPreview | null;
  onConfirm: () => void;
  isApplying: boolean;
}

const OptimizationPreviewDialog = ({
  open, onOpenChange, preview, onConfirm, isApplying,
}: OptimizationPreviewDialogProps) => {
  if (!preview) return null;

  const hasTimeSaved = preview.timeSaved > 0;
  const hasChanges = preview.proposedChanges.length > 0;

  const changesByDate = preview.proposedChanges.reduce<Record<string, ProposedChange[]>>((acc, c) => {
    if (!acc[c.date]) acc[c.date] = [];
    acc[c.date].push(c);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Route Optimisation Preview
          </DialogTitle>
          <DialogDescription>
            Review the proposed schedule changes before applying.
          </DialogDescription>
        </DialogHeader>

        {/* Fallback distances warning */}
        {preview.usedFallbackDistances && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-sunshine/10 border border-sunshine/30">
            <AlertTriangle className="w-5 h-5 text-sunshine shrink-0 mt-0.5" />
            <p className="text-sm text-sunshine">
              ⚠ Live traffic data was unavailable — travel times are estimated{preview.fallbackPairs ? ` for ${preview.fallbackPairs} leg${preview.fallbackPairs === 1 ? "" : "s"}` : ""}. Results may be less accurate.
            </p>
          </div>
        )}

        {/* Overflow warning */}
        {preview.overflowJobs && preview.overflowJobs.length > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm text-destructive">
              <p className="font-semibold mb-1">{preview.overflowJobs.length} job{preview.overflowJobs.length === 1 ? " doesn't" : "s don't"} fit your working hours.</p>
              <ul className="list-disc list-inside space-y-0.5">
                {preview.overflowJobs.slice(0, 5).map(o => (
                  <li key={o.jobId}>{o.clientName} — {o.title} ({o.date})</li>
                ))}
              </ul>
            </div>
          </div>
        )}


        {/* Summary banner */}
        {hasTimeSaved ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                We found a better route — saves {preview.timeSaved} minutes of driving today.
              </p>
              <p className="text-xs text-muted-foreground">
                {preview.proposedChanges.length} job{preview.proposedChanges.length !== 1 ? "s" : ""} will be rescheduled
              </p>
            </div>
          </div>
        ) : hasChanges ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-sky/10 border border-sky/30">
            <div className="w-10 h-10 rounded-xl bg-sky/20 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-sky" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Your route is already optimal.
              </p>
              <p className="text-xs text-muted-foreground">
                We've set start times based on your working hours.
              </p>
            </div>
          </div>
        ) : null}

        {/* Changes by date */}
        {hasChanges && (
          <div className="space-y-4">
            {Object.entries(changesByDate).map(([date, changes]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {format(new Date(date + "T00:00:00"), "EEEE, d MMM yyyy")}
                </p>
                <div className="space-y-2">
                  {changes.map((change) => (
                    <div
                      key={change.jobId}
                      className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{change.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{change.clientName}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs font-mono">
                          {change.currentTime || "No time"}
                        </Badge>
                        <ArrowRight className="w-3.5 h-3.5 text-primary" />
                        <Badge className="text-xs font-mono bg-primary/10 text-primary border-primary/20">
                          {change.newTime}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          {hasChanges && (
            <Button onClick={onConfirm} disabled={isApplying}>
              {isApplying ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Applying...</>
              ) : (
                <><Check className="w-4 h-4 mr-1" /> {hasTimeSaved ? "Apply Changes" : "Apply Times"}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OptimizationPreviewDialog;
