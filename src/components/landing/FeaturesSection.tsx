import { Calendar, MapPin, Clock, Shield, Star, Repeat } from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Easy Online Booking",
    description:
      "Book your lawn service in minutes. Choose your date, time, and service preferences with just a few clicks.",
  },
  {
    icon: MapPin,
    title: "Address Verification",
    description:
      "We verify each property to ensure accurate pricing based on your lawn's exact size and requirements.",
  },
  {
    icon: Clock,
    title: "Flexible Scheduling",
    description:
      "One-time or recurring services. Weekly, bi-weekly, or monthly – you choose what works best for you.",
  },
  {
    icon: Shield,
    title: "Verified Professionals",
    description:
      "All our contractors are thoroughly vetted, insured, and trained to deliver top-quality service.",
  },
  {
    icon: Star,
    title: "Quality Guaranteed",
    description:
      "Not satisfied? We'll make it right. Your satisfaction is our top priority.",
  },
  {
    icon: Repeat,
    title: "Recurring Discounts",
    description:
      "Save more with recurring bookings. The more you book, the more you save on every visit.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="services" className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything You Need for a <span className="gradient-text">Perfect Lawn</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Professional lawn care made simple with features designed to make
            your life easier.
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
