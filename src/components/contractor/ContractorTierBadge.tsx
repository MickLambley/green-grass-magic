import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ContractorTier = "probation" | "standard" | "premium";

const tierConfig: Record<ContractorTier, { label: string; emoji: string; tooltip: string; className: string }> = {
  probation: {
    label: "New Contractor",
    emoji: "🌱",
    tooltip: "This contractor is new to Lawnly and building their reputation",
    className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  },
  standard: {
    label: "Verified Contractor",
    emoji: "✓",
    tooltip: "This contractor has a proven track record on Lawnly",
    className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  },
  premium: {
    label: "Premium Contractor",
    emoji: "⭐",
    tooltip: "This contractor is one of Lawnly's top performers",
    className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  },
};

interface ContractorTierBadgeProps {
  tier: string;
  showTooltip?: boolean;
}

const ContractorTierBadge = ({ tier, showTooltip = true }: ContractorTierBadgeProps) => {
  const config = tierConfig[(tier as ContractorTier)] || tierConfig.probation;

  const badge = (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      <span>{config.emoji}</span>
      {config.label}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ContractorTierBadge;
