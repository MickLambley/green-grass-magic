import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight, MapPin, Loader2, Check, X } from "lucide-react";
import { format } from "date-fns";

interface ProposedChange {
  jobId: string;
  title: string;
  clientName: string;
  date: string;
  currentTime: string | null;
  newTime: string;
}

interface OptimizationPreview {
  timeSaved: number;
  proposedChanges: ProposedChange[];
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
            Optimization Preview
          </DialogTitle>
          <DialogDescription>
            Review the proposed schedule changes before applying.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Save {preview.timeSaved} minutes of travel time
            </p>
            <p className="text-xs text-muted-foreground">
              {preview.proposedChanges.length} job{preview.proposedChanges.length !== 1 ? "s" : ""} will be rescheduled
            </p>
          </div>
        </div>

        {/* Changes by date */}
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
                        {change.currentTime || "—"}
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

        {preview.proposedChanges.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No schedule changes needed — your routes are already optimal!
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          {preview.proposedChanges.length > 0 && (
            <Button onClick={onConfirm} disabled={isApplying}>
              {isApplying ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Applying...</>
              ) : (
                <><Check className="w-4 h-4 mr-1" /> Apply Changes</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OptimizationPreviewDialog;
