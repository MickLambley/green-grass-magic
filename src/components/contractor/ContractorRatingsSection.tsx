import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Star, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Contractor = Database["public"]["Tables"]["contractors"]["Row"];

interface RatingEntry {
  id: string;
  customer_rating: number;
  rating_comment: string | null;
  rating_submitted_at: string;
  contractor_rating_response: string | null;
  customerName: string;
  scheduled_date: string;
}

interface ContractorRatingsSectionProps {
  contractor: Contractor;
}

const ContractorRatingsSection = ({ contractor }: ContractorRatingsSectionProps) => {
  const [ratings, setRatings] = useState<RatingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchRatings();
  }, [contractor.id]);

  const fetchRatings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bookings")
      .select("id, customer_rating, rating_comment, rating_submitted_at, contractor_rating_response, user_id, scheduled_date")
      .eq("contractor_id", contractor.id)
      .not("customer_rating", "is", null)
      .order("rating_submitted_at", { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      setRatings(data.map(d => ({
        id: d.id,
        customer_rating: d.customer_rating!,
        rating_comment: d.rating_comment,
        rating_submitted_at: d.rating_submitted_at!,
        contractor_rating_response: d.contractor_rating_response,
        customerName: profileMap.get(d.user_id) || "Customer",
        scheduled_date: d.scheduled_date,
      })));
    }
    setLoading(false);
  };

  const handleSubmitResponse = async (bookingId: string) => {
    if (!responseText.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("bookings")
      .update({ contractor_rating_response: responseText.slice(0, 200) })
      .eq("id", bookingId);

    if (error) {
      toast.error("Failed to submit response");
    } else {
      toast.success("Response submitted");
      setRespondingId(null);
      setResponseText("");
      fetchRatings();
    }
    setSubmitting(false);
  };

  const renderStars = (count: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          className={`w-4 h-4 ${s <= count ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`}
        />
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            My Ratings
          </span>
          <span className="text-lg font-bold">
            {contractor.average_rating ? `${contractor.average_rating} ⭐` : "No ratings"} 
            {contractor.total_ratings_count ? (
              <span className="text-sm font-normal text-muted-foreground ml-1">
                from {contractor.total_ratings_count} job{contractor.total_ratings_count !== 1 ? "s" : ""}
              </span>
            ) : null}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : ratings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No ratings yet. Complete jobs to receive customer feedback.
          </p>
        ) : (
          <div className="space-y-4">
            {ratings.map(r => (
              <div key={r.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {renderStars(r.customer_rating)}
                    <span className="text-sm font-medium">{r.customerName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.rating_submitted_at).toLocaleDateString("en-AU")}
                  </span>
                </div>
                {r.rating_comment && (
                  <p className="text-sm text-muted-foreground">{r.rating_comment}</p>
                )}
                {r.contractor_rating_response ? (
                  <div className="bg-muted rounded-md p-2 text-sm">
                    <span className="font-medium text-xs">Your response:</span>
                    <p className="text-muted-foreground">{r.contractor_rating_response}</p>
                  </div>
                ) : respondingId === r.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value.slice(0, 200))}
                      placeholder="Write a response (admin-only visibility)..."
                      rows={2}
                      maxLength={200}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setRespondingId(null)}>Cancel</Button>
                      <Button size="sm" disabled={submitting || !responseText.trim()} onClick={() => handleSubmitResponse(r.id)}>
                        {submitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                        Send
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setRespondingId(r.id); setResponseText(""); }}
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Respond
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ContractorRatingsSection;
