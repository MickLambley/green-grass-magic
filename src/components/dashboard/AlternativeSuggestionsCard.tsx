import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Check, X, User } from "lucide-react";
import { toast } from "sonner";

interface AlternativeSuggestion {
  id: string;
  booking_id: string;
  contractor_id: string;
  suggested_date: string;
  suggested_time_slot: string;
  status: string;
  created_at: string;
  contractor?: {
    business_name: string | null;
    user_id: string;
  };
  contractor_profile?: {
    full_name: string | null;
  };
}

interface AlternativeSuggestionsCardProps {
  suggestions: AlternativeSuggestion[];
  bookingId: string;
  onSuggestionResponse: () => void;
}

const timeSlotLabels: Record<string, string> = {
  "7am-10am": "7:00 AM - 10:00 AM",
  "10am-2pm": "10:00 AM - 2:00 PM",
  "2pm-5pm": "2:00 PM - 5:00 PM",
};

export const AlternativeSuggestionsCard = ({
  suggestions,
  bookingId,
  onSuggestionResponse,
}: AlternativeSuggestionsCardProps) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const pendingSuggestions = suggestions.filter(s => s.status === "pending");

  if (pendingSuggestions.length === 0) return null;

  const handleAccept = async (suggestion: AlternativeSuggestion) => {
    setIsProcessing(suggestion.id);
    try {
      // Update the suggestion status to accepted
      const { error: suggestionError } = await supabase
        .from("alternative_suggestions")
        .update({ 
          status: "accepted",
          responded_at: new Date().toISOString()
        })
        .eq("id", suggestion.id);

      if (suggestionError) throw suggestionError;

      // Update the booking with the new date/time and confirm it
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          scheduled_date: suggestion.suggested_date,
          time_slot: suggestion.suggested_time_slot,
          contractor_id: suggestion.contractor_id,
          contractor_accepted_at: new Date().toISOString(),
          status: "confirmed",
        })
        .eq("id", bookingId);

      if (bookingError) throw bookingError;

      // Decline all other pending suggestions for this booking
      await supabase
        .from("alternative_suggestions")
        .update({ 
          status: "declined",
          responded_at: new Date().toISOString()
        })
        .eq("booking_id", bookingId)
        .eq("status", "pending")
        .neq("id", suggestion.id);

      // Notify the contractor
      const { data: contractorData } = await supabase
        .from("contractors")
        .select("user_id")
        .eq("id", suggestion.contractor_id)
        .single();

      if (contractorData) {
        await supabase.from("notifications").insert({
          user_id: contractorData.user_id,
          title: "Alternative Time Accepted",
          message: `Your suggested time for ${new Date(suggestion.suggested_date).toLocaleDateString("en-AU", {
            weekday: "long",
            month: "long",
            day: "numeric"
          })} at ${timeSlotLabels[suggestion.suggested_time_slot] || suggestion.suggested_time_slot} has been accepted!`,
          type: "success",
          booking_id: bookingId,
        });
      }

      toast.success("Alternative time accepted! Booking is now confirmed.");
      onSuggestionResponse();
    } catch (error) {
      console.error("Error accepting suggestion:", error);
      toast.error("Failed to accept suggestion");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDecline = async (suggestion: AlternativeSuggestion) => {
    setIsProcessing(suggestion.id);
    try {
      const { error } = await supabase
        .from("alternative_suggestions")
        .update({ 
          status: "declined",
          responded_at: new Date().toISOString()
        })
        .eq("id", suggestion.id);

      if (error) throw error;

      // Notify the contractor
      const { data: contractorData } = await supabase
        .from("contractors")
        .select("user_id")
        .eq("id", suggestion.contractor_id)
        .single();

      if (contractorData) {
        await supabase.from("notifications").insert({
          user_id: contractorData.user_id,
          title: "Alternative Time Declined",
          message: `Your suggested time for ${new Date(suggestion.suggested_date).toLocaleDateString("en-AU", {
            weekday: "long",
            month: "long",
            day: "numeric"
          })} at ${timeSlotLabels[suggestion.suggested_time_slot] || suggestion.suggested_time_slot} was declined by the customer.`,
          type: "info",
          booking_id: bookingId,
        });
      }

      toast.success("Suggestion declined");
      onSuggestionResponse();
    } catch (error) {
      console.error("Error declining suggestion:", error);
      toast.error("Failed to decline suggestion");
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
          Alternative Times Suggested
        </span>
      </div>
      <div className="space-y-2">
        {pendingSuggestions.map((suggestion) => {
          const contractorName = 
            suggestion.contractor?.business_name || 
            suggestion.contractor_profile?.full_name || 
            "Contractor";
          
          return (
            <div 
              key={suggestion.id} 
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white dark:bg-background rounded border border-amber-100 dark:border-amber-900"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span className="font-medium">{contractorName}</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <Calendar className="w-3 h-3 text-primary" />
                  <span>
                    {new Date(suggestion.suggested_date).toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>
                    {timeSlotLabels[suggestion.suggested_time_slot] || suggestion.suggested_time_slot}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAccept(suggestion)}
                  disabled={isProcessing === suggestion.id}
                >
                  <Check className="w-3 h-3 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDecline(suggestion)}
                  disabled={isProcessing === suggestion.id}
                >
                  <X className="w-3 h-3 mr-1" />
                  Decline
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AlternativeSuggestionsCard;
