import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, ArrowLeft, ClipboardCheck, Wallet } from "lucide-react";
import type { OperationalRulesData } from "./types";

interface OperationalRulesStepProps {
  data: OperationalRulesData;
  onChange: (data: OperationalRulesData) => void;
  onNext: () => void;
  onBack: () => void;
}

const OPERATIONAL_RULES = [
  {
    key: "agreePhotoUpload" as const,
    label: "To ensure payment is released from escrow, I agree to upload a \"Before\" and \"After\" photo for every job via the app, unless otherwise instructed by the platform.",
  },
  {
    key: "agreeSafeWorksite" as const,
    label: "I agree to maintain a safe work site for myself and the public while on site.",
  },
  {
    key: "agreeCancellationPolicy" as const,
    label: "I understand that repeatedly cancelling or failing to attend accepted bookings may limit my ability to accept future jobs.",
  },
  {
    key: "agreePromptCommunication" as const,
    label: "I agree to communicate promptly with customers if there are delays, issues, or changes to a booking.",
  },
  {
    key: "agreeProfessionalStandard" as const,
    label: "I agree to complete the booked services (mowing and edging where applicable) to a reasonable professional standard.",
  },
];

const PAYMENT_RULES = [
  {
    key: "agreeEscrowPayment" as const,
    label: "I understand payments are held in escrow from booking until job completion.",
  },
  {
    key: "agreeDisputeProcess" as const,
    label: "I understand that Lawnly may request photos or information if a customer raises a dispute before releasing payment.",
  },
];

export const OperationalRulesStep = ({ data, onChange, onNext, onBack }: OperationalRulesStepProps) => {
  const allOperationalChecked = OPERATIONAL_RULES.every(rule => data[rule.key]);
  const allPaymentChecked = PAYMENT_RULES.every(rule => data[rule.key]);
  const isValid = allOperationalChecked && allPaymentChecked;

  const toggleRule = (key: keyof OperationalRulesData) => {
    onChange({ ...data, [key]: !data[key] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Operational Rules & Agreements</CardTitle>
            <CardDescription>
              Required acknowledgements before accepting jobs
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Operational Rules */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            Operational Rules
          </h3>
          <div className="space-y-3">
            {OPERATIONAL_RULES.map((rule) => (
              <div
                key={rule.key}
                className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                  data[rule.key]
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
                onClick={() => toggleRule(rule.key)}
              >
                <Checkbox
                  id={rule.key}
                  checked={data[rule.key]}
                  onCheckedChange={() => toggleRule(rule.key)}
                  className="mt-0.5"
                />
                <label
                  htmlFor={rule.key}
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  {rule.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Payment & Disputes */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Payments & Disputes
          </h3>
          <div className="space-y-3">
            {PAYMENT_RULES.map((rule) => (
              <div
                key={rule.key}
                className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                  data[rule.key]
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
                onClick={() => toggleRule(rule.key)}
              >
                <Checkbox
                  id={rule.key}
                  checked={data[rule.key]}
                  onCheckedChange={() => toggleRule(rule.key)}
                  className="mt-0.5"
                />
                <label
                  htmlFor={rule.key}
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  {rule.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button onClick={onNext} disabled={!isValid} className="gap-2">
            Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
