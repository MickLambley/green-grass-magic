import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const pricingTiers = [
  {
    name: "Free",
    description: "Get started at no cost",
    price: 0,
    features: [
      "Up to 10 clients",
      "Job scheduling",
      "Basic invoicing",
      "Online payments (5% fee)",
    ],
    popular: false,
  },
  {
    name: "Starter",
    description: "For growing businesses",
    price: 29,
    features: [
      "Up to 50 clients",
      "Recurring job scheduling",
      "Quotes & invoices",
      "Online payments (3% fee)",
      "Email notifications",
    ],
    popular: false,
  },
  {
    name: "Pro",
    description: "For established operators",
    price: 59,
    features: [
      "Unlimited clients",
      "Everything in Starter",
      "Business website",
      "Online payments (1% fee)",
      "Priority support",
      "Business insights",
    ],
    popular: true,
  },
  {
    name: "Team",
    description: "For multi-crew operations",
    price: 99,
    features: [
      "Everything in Pro",
      "Multiple team members",
      "Crew scheduling",
      "Online payments (1% fee)",
      "Custom branding",
      "Dedicated support",
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
            Start free, upgrade as you grow. No lock-in contracts. Cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {pricingTiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-6 transition-all duration-300 hover:-translate-y-2 ${
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

              <div className="text-center mb-6">
                <h3
                  className={`font-display text-xl font-semibold mb-1 ${
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
                  {tier.description}
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
                    /mo
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
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

              <Link to="/contractor-auth?mode=signup">
                <Button
                  className="w-full"
                  variant={tier.popular ? "secondary" : "default"}
                  size="lg"
                >
                  {tier.price === 0 ? "Start Free" : "Get Started"}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-muted-foreground text-sm mt-8">
          All plans include secure data storage and Australian support. Transaction fees apply to online payments only.
        </p>
      </div>
    </section>
  );
};

export default PricingSection;
