import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface StatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingAction: { userId: string; newStatus: string; userType: string } | null;
  onConfirm: (reason: string) => void;
}

const StatusChangeDialog = ({ open, onOpenChange, pendingAction, onConfirm }: StatusChangeDialogProps) => {
  const [reason, setReason] = useState("");

  const isDelete = pendingAction?.newStatus === "deleted";
  const formatStatus = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const handleConfirm = () => {
    onConfirm(reason);
    setReason("");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isDelete && <AlertTriangle className="w-5 h-5 text-destructive" />}
            {isDelete ? "Delete User" : "Change User Status"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {pendingAction && !isDelete && (
                <p>
                  Change status to <strong>{formatStatus(pendingAction.newStatus)}</strong>?
                </p>
              )}
              {isDelete && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  <strong>Warning:</strong> This action is permanent and cannot be undone. All user data will be removed.
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason / Note (optional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Add a reason for this change..."
                  rows={3}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason("")}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={isDelete ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {isDelete ? "Delete Permanently" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default StatusChangeDialog;
