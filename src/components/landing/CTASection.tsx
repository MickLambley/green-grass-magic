import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-20 md:py-32 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4" />
            <span>Ready to grow your business?</span>
          </div>

          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
            Stop Chasing Payments. Start Growing.
          </h2>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Join hundreds of Aussie lawn care contractors who use Yardly to run their 
            business more efficiently. Sign up in 2 minutes — no credit card required.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/contractor-auth?mode=signup">
              <Button variant="hero" size="xl">
                Start Your Free Account
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>

          <p className="text-sm text-muted-foreground mt-6">
            Free forever plan • No credit card required • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
