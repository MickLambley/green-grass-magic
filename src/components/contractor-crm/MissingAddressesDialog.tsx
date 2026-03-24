import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, MapPin, ArrowRight } from "lucide-react";

interface AffectedJob {
  jobId: string;
  jobTitle: string;
  clientName: string;
  clientId: string;
}

interface MissingAddressesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affectedJobs: AffectedJob[];
  onEditClient: (clientId: string) => void;
}

const MissingAddressesDialog = ({
  open, onOpenChange, affectedJobs, onEditClient,
}: MissingAddressesDialogProps) => {
  if (affectedJobs.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={() => {/* prevent dismiss by clicking outside */}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sunshine">
            <AlertTriangle className="w-5 h-5" />
            Address Required
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Route optimisation needs a location for every job. The following jobs are missing an address:
        </p>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {affectedJobs.map((job) => (
            <div
              key={job.jobId}
              className="flex items-center justify-between gap-3 p-2.5 bg-sunshine/5 border border-sunshine/20 rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{job.jobTitle}</p>
                <p className="text-xs text-muted-foreground truncate">{job.clientName}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-primary shrink-0"
                onClick={() => {
                  onEditClient(job.clientId);
                }}
              >
                <MapPin className="w-3.5 h-3.5 mr-1" />
                Add Address <ArrowRight className="w-3 h-3 ml-0.5" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onEditClient(affectedJobs[0].clientId)}>
            Fix Addresses
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MissingAddressesDialog;
