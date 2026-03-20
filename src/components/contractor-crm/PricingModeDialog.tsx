import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, FileQuestion, Layers, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type PricingMode = "fixed_prices" | "quote_required" | "prices_and_quote";

interface PricingConfig {
  base_price: number;
  price_per_sqm: number;
  clippings_removal_fee: number;
  minimum_price: number;
}

interface PricingModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMode: PricingMode | null;
  pricing: PricingConfig | null;
  onConfirm: (mode: PricingMode) => void;
  onNavigateToPricing: () => void;
  isPublishing: boolean;
  isFirstPublish: boolean;
}

const MODE_OPTIONS: { value: PricingMode; label: string; description: string; icon: typeof DollarSign }[] = [
  {
    value: "fixed_prices",
    label: "Show Fixed Prices",
    description: "Display your rates publicly so clients can book instantly.",
    icon: DollarSign,
  },
  {
    value: "quote_required",
    label: "Quote Required",
    description: "Hide prices and let clients request a quote instead.",
    icon: FileQuestion,
  },
  {
    value: "prices_and_quote",
    label: "Show Prices + Quote Option",
    description: "Display standard rates and offer a quote for complex jobs.",
    icon: Layers,
  },
];

const PricingModeDialog = ({
  open,
  onOpenChange,
  currentMode,
  pricing,
  onConfirm,
  onNavigateToPricing,
  isPublishing,
  isFirstPublish,
}: PricingModeDialogProps) => {
  const [selected, setSelected] = useState<PricingMode | null>(currentMode);

  const showPricingSummary =
    selected && selected !== "quote_required";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">How should we display your pricing?</DialogTitle>
          <DialogDescription>
            Choose how pricing appears on your public website.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {MODE_OPTIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                className={cn(
                  "w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40 bg-card"
                )}
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  <opt.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Pricing Summary */}
        {showPricingSummary && pricing && (
          <div className="mt-4 p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Your Current Pricing</h4>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  onOpenChange(false);
                  onNavigateToPricing();
                }}
              >
                Edit Pricing <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Base Price</p>
                <p className="font-mono font-semibold text-foreground">${pricing.base_price.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Price per m²</p>
                <p className="font-mono font-semibold text-foreground">${pricing.price_per_sqm.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Minimum Price</p>
                <p className="font-mono font-semibold text-foreground">${pricing.minimum_price.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clippings Removal</p>
                <p className="font-mono font-semibold text-foreground">${pricing.clippings_removal_fee.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {showPricingSummary && !pricing && (
          <div className="mt-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-sm">
            <p className="text-foreground font-medium">No pricing set yet.</p>
            <p className="text-muted-foreground text-xs mt-1">
              Set up your pricing first so clients can see your rates.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                onOpenChange(false);
                onNavigateToPricing();
              }}
            >
              Set Up Pricing
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isFirstPublish ? "Not ready yet" : "Cancel"}
          </button>
          <Button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Confirm & Publish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PricingModeDialog;

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  fixed_prices: "Fixed Prices",
  quote_required: "Quote Required",
  prices_and_quote: "Prices + Quotes",
};
