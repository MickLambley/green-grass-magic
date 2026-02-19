import { Users, Calendar, FileText, CreditCard, Globe, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Client Management",
    description:
      "Keep all your customers in one place. Store contact details, property notes, and service history for every client.",
  },
  {
    icon: Calendar,
    title: "Job Scheduling",
    description:
      "Schedule one-off or recurring jobs with ease. Set up weekly, fortnightly, or monthly mowing rounds in seconds.",
  },
  {
    icon: FileText,
    title: "Quotes & Invoices",
    description:
      "Create professional quotes and invoices in a few taps. Send them directly to your clients via email.",
  },
  {
    icon: CreditCard,
    title: "Online Payments",
    description:
      "Let clients pay online via card. Funds go straight to your bank account — no chasing payments.",
  },
  {
    icon: Globe,
    title: "Your Own Website",
    description:
      "Get a professional booking website for your business. Clients can book and pay online 24/7.",
  },
  {
    icon: BarChart3,
    title: "Business Insights",
    description:
      "Track revenue, job completion rates, and client growth. Know exactly how your business is performing.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="services" className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything You Need to <span className="gradient-text">Grow Your Business</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Stop juggling spreadsheets, texts, and paper invoices. Yardly brings it all together.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group bg-card rounded-2xl p-8 shadow-soft hover:shadow-medium transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-14 h-14 rounded-xl gradient-hero flex items-center justify-center mb-6 shadow-soft group-hover:shadow-medium transition-shadow">
                <feature.icon className="w-7 h-7 text-primary-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
