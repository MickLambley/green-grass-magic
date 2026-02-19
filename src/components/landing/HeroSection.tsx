import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Star } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-grass-light/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-grass-light/30 text-grass-dark px-4 py-2 rounded-full text-sm font-medium mb-8 animate-fade-in">
            <Star className="w-4 h-4 fill-sunshine text-sunshine" />
            <span>Trusted by 10,000+ homeowners</span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 animate-slide-up">
            Your Lawn, <span className="gradient-text">Perfectly Maintained</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Professional lawn mowing services at your fingertips. Book online,
            track your service, and enjoy a pristine lawn without lifting a
            finger.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Link to="/auth?mode=signup">
              <Button variant="hero" size="xl">
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/about">
              <Button variant="heroOutline" size="xl">
                Learn More
              </Button>
            </Link>
          </div>

          {/* Trust Points */}
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 text-sm text-muted-foreground animate-slide-up" style={{ animationDelay: "0.3s" }}>
            {[
              "No contracts required",
              "Instant online booking",
              "Verified professionals",
            ].map((point) => (
              <div key={point} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hero Image/Illustration Area */}
        <div className="mt-16 md:mt-20 max-w-5xl mx-auto animate-slide-up" style={{ animationDelay: "0.4s" }}>
          <div className="relative rounded-2xl overflow-hidden shadow-large bg-gradient-to-br from-grass-light/50 to-accent/30 aspect-video flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
            <div className="relative z-10 text-center p-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full gradient-hero flex items-center justify-center shadow-large">
                <svg className="w-12 h-12 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <p className="text-lg font-display font-semibold text-foreground">
                Beautiful lawns, happy homeowners
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
