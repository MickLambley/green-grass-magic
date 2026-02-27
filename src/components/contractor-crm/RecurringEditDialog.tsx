import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarClock, Pencil } from "lucide-react";

interface RecurringEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThisOnly: () => void;
  onAllFuture: () => void;
}

const RecurringEditDialog = ({ open, onOpenChange, onThisOnly, onAllFuture }: RecurringEditDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Edit Recurring Job
          </AlertDialogTitle>
          <AlertDialogDescription>
            This job is part of a recurring series. Do you want to edit only this job or all future jobs in this series?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onThisOnly}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            <Pencil className="w-4 h-4 mr-1.5" />
            Only This Job
          </AlertDialogAction>
          <AlertDialogAction onClick={onAllFuture}>
            <CalendarClock className="w-4 h-4 mr-1.5" />
            All Future Jobs
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RecurringEditDialog;
