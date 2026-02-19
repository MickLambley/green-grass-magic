import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const pricingTiers = [
  {
    name: "Small Yard",
    size: "Up to 250 m²",
    price: 45,
    features: [
      "Professional mowing",
      "Edge trimming",
      "Grass clippings cleanup",
      "Same-week booking",
    ],
    popular: false,
  },
  {
    name: "Medium Yard",
    size: "250 - 500 m²",
    price: 75,
    features: [
      "Everything in Small Yard",
      "Detailed edging",
      "Flower bed cleanup",
      "Priority scheduling",
    ],
    popular: true,
  },
  {
    name: "Large Yard",
    size: "500+ m²",
    price: 120,
    features: [
      "Everything in Medium Yard",
      "Comprehensive service",
      "Hedge trimming included",
      "Dedicated contractor",
    ],
    popular: false,
  },
];

const PricingSection = () => {
  return (
    <section id="pricing" className="py-20 md:py-32">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Simple, Transparent <span className="gradient-text">Pricing</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Pay only for what you need. No hidden fees, no surprises. Get 15%
            off with recurring bookings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {pricingTiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-8 transition-all duration-300 hover:-translate-y-2 ${
                tier.popular
                  ? "bg-primary text-primary-foreground shadow-large scale-105"
                  : "bg-card shadow-soft hover:shadow-medium"
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-sunshine text-foreground px-4 py-1 rounded-full text-sm font-semibold shadow-soft">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <h3
                  className={`font-display text-xl font-semibold mb-2 ${
                    tier.popular ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {tier.name}
                </h3>
                <p
                  className={`text-sm mb-4 ${
                    tier.popular
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  }`}
                >
                  {tier.size}
                </p>
                <div className="flex items-baseline justify-center gap-1">
                  <span
                    className={`text-4xl font-display font-bold ${
                      tier.popular ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    ${tier.price}
                  </span>
                  <span
                    className={
                      tier.popular
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }
                  >
                    /visit
                  </span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        tier.popular
                          ? "bg-primary-foreground/20"
                          : "bg-primary/10"
                      }`}
                    >
                      <Check
                        className={`w-3 h-3 ${
                          tier.popular ? "text-primary-foreground" : "text-primary"
                        }`}
                      />
                    </div>
                    <span
                      className={`text-sm ${
                        tier.popular
                          ? "text-primary-foreground/90"
                          : "text-muted-foreground"
                      }`}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Link to="/auth?mode=signup">
                <Button
                  className="w-full"
                  variant={tier.popular ? "secondary" : "default"}
                  size="lg"
                >
                  Get Started
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-muted-foreground text-sm mt-8">
          *Final pricing based on verified property size. Recurring customers
          save 15%.
        </p>
      </div>
    </section>
  );
};

export default PricingSection;
