import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Users, Target, Heart, ArrowRight } from "lucide-react";

const values = [
  {
    icon: Users,
    title: "Customer First",
    description:
      "Everything we do is centered around making lawn care effortless for our customers. Your satisfaction drives our innovation.",
  },
  {
    icon: Target,
    title: "Quality Focused",
    description:
      "We partner only with verified, skilled contractors who share our commitment to delivering exceptional results every time.",
  },
  {
    icon: Heart,
    title: "Community Driven",
    description:
      "We're building a community of homeowners and lawn care professionals who take pride in beautiful, well-maintained spaces.",
  },
];

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        {/* Hero Section */}
        <section className="pt-32 pb-20 md:pt-40 md:pb-32">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-6">
                About <span className="gradient-text">Lawnly</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                We're on a mission to make professional lawn care accessible to
                everyone. No more scheduling headaches, unreliable service, or
                confusing pricing.
              </p>
            </div>
          </div>
        </section>

        {/* Story Section */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
              <div>
                <h2 className="font-display text-3xl font-bold text-foreground mb-6">
                  Our Story
                </h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    Lawnly was born from a simple frustration: why is it so hard
                    to find reliable lawn care? Endless phone calls, no-show
                    contractors, and unpredictable pricing made maintaining a
                    beautiful lawn feel like a full-time job.
                  </p>
                  <p>
                    We set out to change that. By combining technology with a
                    network of vetted professionals, we've created a platform
                    that makes booking lawn care as easy as ordering food
                    delivery.
                  </p>
                  <p>
                    Today, Lawnly serves thousands of homeowners, helping them
                    reclaim their weekends while ensuring their lawns look
                    amazing year-round.
                  </p>
                </div>
              </div>
              <div className="relative">
                <div className="rounded-2xl overflow-hidden shadow-large bg-gradient-to-br from-grass-light/50 to-accent/30 aspect-square flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full gradient-hero flex items-center justify-center shadow-large">
                      <span className="text-4xl font-display font-bold text-primary-foreground">
                        L
                      </span>
                    </div>
                    <p className="text-lg font-display font-semibold text-foreground">
                      Founded in 2024
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
                Our Values
              </h2>
              <p className="text-lg text-muted-foreground">
                The principles that guide everything we do at Lawnly.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {values.map((value) => (
                <div
                  key={value.title}
                  className="bg-card rounded-2xl p-8 shadow-soft hover:shadow-medium transition-all duration-300 hover:-translate-y-1 text-center"
                >
                  <div className="w-16 h-16 rounded-xl gradient-hero flex items-center justify-center mx-auto mb-6 shadow-soft">
                    <value.icon className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                    {value.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {value.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="font-display text-3xl font-bold text-foreground mb-6">
                Ready to Experience the Difference?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Join thousands of homeowners who trust Lawnly for their lawn
                care needs.
              </p>
              <Link to="/auth?mode=signup">
                <Button variant="hero" size="xl">
                  Get Started Today
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
