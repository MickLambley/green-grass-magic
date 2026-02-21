import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MarkPaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: {
    id: string;
    title: string;
    client_name: string;
    total_price: number | null;
  } | null;
  onMarked: () => void;
}

const MarkPaidDialog = ({ open, onOpenChange, job, onMarked }: MarkPaidDialogProps) => {
  const [processing, setProcessing] = useState(false);

  const handleMarkPaid = async () => {
    if (!job) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-job-v2", {
        body: { jobId: job.id, action: "mark_paid" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Payment recorded successfully");
      onOpenChange(false);
      onMarked();
    } catch (err: any) {
      toast.error(err.message || "Failed to mark as paid");
    } finally {
      setProcessing(false);
    }
  };

  if (!job) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-display">
            <DollarSign className="w-5 h-5 text-primary" />
            Confirm Payment Received
          </AlertDialogTitle>
          <AlertDialogDescription>
            Did you receive payment for <strong>{job.title}</strong> from <strong>{job.client_name}</strong>
            {job.total_price ? ` ($${Number(job.total_price).toFixed(2)})` : ""}?
            This will mark the job and linked invoice as paid.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleMarkPaid} disabled={processing}>
            {processing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <DollarSign className="w-4 h-4 mr-1" />}
            Yes, Payment Received
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default MarkPaidDialog;
