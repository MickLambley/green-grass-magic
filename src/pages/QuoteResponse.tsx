import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, FileText } from "lucide-react";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface QuoteData {
  quote: {
    line_items: LineItem[];
    total: number;
    notes: string | null;
    status: string;
    valid_until: string | null;
    created_at: string;
  };
  contractor: {
    business_name?: string;
    business_logo_url?: string;
    primary_color?: string;
    gst_registered?: boolean;
    abn?: string;
  };
  client: { name?: string };
}

const QuoteResponse = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<QuoteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [responded, setResponded] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Invalid link"); setIsLoading(false); return; }
    fetchQuote();
  }, [token]);

  const fetchQuote = async () => {
    const { data: result, error: err } = await supabase.functions.invoke("get-quote-by-token", {
      body: null,
      headers: {},
      method: "GET",
    });

    // Use fetch directly since invoke doesn't support GET params well
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-quote-by-token?token=${token}`;
    const res = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });

    if (!res.ok) { setError("Quote not found"); setIsLoading(false); return; }
    const json = await res.json();
    setData(json);
    if (json.quote.status === "accepted" || json.quote.status === "declined") {
      setResponded(json.quote.status);
    }
    setIsLoading(false);
  };

  const handleRespond = async (action: "accepted" | "declined") => {
    setIsResponding(true);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/respond-quote`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ token, action }),
    });

    const json = await res.json();
    if (json.success) {
      setResponded(action);
      if (data) setData({ ...data, quote: { ...data.quote, status: action } });
    }
    setIsResponding(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">Quote Not Found</h2>
            <p className="text-muted-foreground text-sm">This link may be invalid or expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { quote, contractor, client } = data;
  const items = Array.isArray(quote.line_items) ? (quote.line_items as LineItem[]) : [];
  const brandColor = contractor.primary_color || "#16a34a";
  const validUntil = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center p-4 pt-8 md:pt-16">
      <div className="max-w-lg w-full space-y-4">
        {/* Header */}
        <div className="rounded-xl p-6 text-white" style={{ background: brandColor }}>
          <div className="flex items-center gap-3">
            {contractor.business_logo_url && (
              <img src={contractor.business_logo_url} alt="" className="w-10 h-10 rounded-lg bg-white/20 object-cover" />
            )}
            <div>
              <h1 className="text-xl font-bold">{contractor.business_name || "Quote"}</h1>
              {contractor.gst_registered && contractor.abn && (
                <p className="text-white/70 text-xs">ABN: {contractor.abn}</p>
              )}
            </div>
          </div>
          <p className="mt-3 text-white/80 text-sm">Quote for {client.name || "Customer"}</p>
        </div>

        {/* Quote Details */}
        <Card>
          <CardContent className="p-6">
            {/* Status banner for already responded */}
            {responded && (
              <div className={`rounded-lg p-4 mb-6 text-center ${
                responded === "accepted" 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}>
                <p className="font-semibold text-lg">
                  {responded === "accepted" ? "✓ Quote Accepted" : "✗ Quote Declined"}
                </p>
                <p className="text-sm mt-1 opacity-80">
                  {responded === "accepted" 
                    ? "Thank you! The contractor has been notified."
                    : "The contractor has been notified of your decision."}
                </p>
              </div>
            )}

            {/* Line items table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 font-medium">Description</th>
                  <th className="text-center py-2 font-medium w-14">Qty</th>
                  <th className="text-right py-2 font-medium w-20">Rate</th>
                  <th className="text-right py-2 font-medium w-20">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((li, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-3">{li.description}</td>
                    <td className="py-3 text-center text-muted-foreground">{li.quantity}</td>
                    <td className="py-3 text-right text-muted-foreground">${li.unit_price.toFixed(2)}</td>
                    <td className="py-3 text-right font-medium">${(li.quantity * li.unit_price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end mt-4 pt-3 border-t-2 border-border">
              <p className="text-xl font-bold text-foreground">
                Total: ${Number(quote.total).toFixed(2)}
              </p>
            </div>

            {validUntil && (
              <div className="mt-4 p-3 rounded-lg bg-muted text-sm">
                <strong>Valid Until:</strong> {validUntil}
              </div>
            )}

            {quote.notes && (
              <p className="mt-4 text-sm text-muted-foreground italic">{quote.notes}</p>
            )}

            {/* Accept / Decline buttons */}
            {!responded && (
              <div className="flex gap-3 mt-8">
                <Button
                  className="flex-1 h-12 text-base"
                  onClick={() => handleRespond("accepted")}
                  disabled={isResponding}
                  style={{ background: brandColor }}
                >
                  {isResponding ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Check className="w-5 h-5 mr-2" />}
                  Accept Quote
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-12 text-base"
                  onClick={() => handleRespond("declined")}
                  disabled={isResponding}
                >
                  {isResponding ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <X className="w-5 h-5 mr-2" />}
                  Decline
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">Powered by Yardly</p>
      </div>
    </div>
  );
};

export default QuoteResponse;
