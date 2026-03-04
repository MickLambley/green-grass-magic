import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Users, Target, Heart, ArrowRight, Wrench } from "lucide-react";

const values = [
  {
    icon: Users,
    title: "Built for Contractors",
    description:
      "Yardly is designed to help lawn care professionals run their business more efficiently — from scheduling to invoicing, all in one place.",
  },
  {
    icon: Target,
    title: "Simple & Powerful",
    description:
      "We strip away the complexity so you can focus on what you do best — delivering great results for your clients.",
  },
  {
    icon: Wrench,
    title: "Tools That Work",
    description:
      "Route optimisation, automated invoicing, client portals, and your own branded website — everything a modern contractor needs.",
  },
  {
    icon: Heart,
    title: "Growing Together",
    description:
      "We're building the platform alongside real contractors, listening to feedback and shipping features that matter.",
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
                About <span className="gradient-text">Yardly</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                The all-in-one platform that helps lawn care contractors manage
                their business, delight their clients, and grow with confidence.
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
                    Yardly started with a simple question: why don't lawn care
                    contractors have better software? Most are stuck juggling
                    spreadsheets, text messages, and paper invoices — losing time
                    and money every week.
                  </p>
                  <p>
                    We built Yardly to change that. A single platform where
                    contractors can schedule jobs, optimise routes, send
                    professional invoices, and even launch their own branded
                    website — all without the tech headaches.
                  </p>
                  <p>
                    Today, Yardly is helping contractors across Australia run
                    smoother operations, get paid faster, and spend more time
                    doing the work they love.
                  </p>
                </div>
              </div>
              <div className="relative">
                <div className="rounded-2xl overflow-hidden shadow-large bg-gradient-to-br from-grass-light/50 to-accent/30 aspect-square flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full gradient-hero flex items-center justify-center shadow-large">
                      <span className="text-4xl font-display font-bold text-primary-foreground">
                        Y
                      </span>
                    </div>
                    <p className="text-lg font-display font-semibold text-foreground">
                      Founded in 2025
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
                What We Believe
              </h2>
              <p className="text-lg text-muted-foreground">
                The principles that drive how we build Yardly.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
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
                Ready to Simplify Your Business?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Join contractors across Australia who use Yardly to save time,
                look professional, and grow their business.
              </p>
              <Link to="/contractor/auth">
                <Button variant="hero" size="xl">
                  Get Started Free
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
