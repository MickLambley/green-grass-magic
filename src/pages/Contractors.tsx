import { Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, DollarSign, Calendar, MapPin, CheckCircle } from "lucide-react";

const benefits = [
  {
    icon: DollarSign,
    title: "Competitive Pay",
    description: "Earn great rates for your lawn care services with transparent pricing.",
  },
  {
    icon: Calendar,
    title: "Flexible Schedule",
    description: "Choose jobs that fit your availability. Work when it suits you.",
  },
  {
    icon: MapPin,
    title: "Local Jobs",
    description: "Get matched with customers in your preferred service areas.",
  },
  {
    icon: Briefcase,
    title: "Grow Your Business",
    description: "Build your client base and reputation through our platform.",
  },
];

const requirements = [
  "Valid driver's license and reliable transportation",
  "Own lawn care equipment (mower, trimmer, etc.)",
  "Ability to pass a background check",
  "Commitment to quality and customer service",
  "Availability for at least 10 hours per week",
];

const Contractors = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-20 md:py-32 bg-gradient-to-b from-primary/5 to-background">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-6">
                Join Our Team of <span className="gradient-text">Lawn Care Pros</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8">
                Partner with Lawnly and grow your lawn care business. Get connected 
                with customers in your area and earn on your own schedule.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/contractor-auth?mode=signup">
                  <Button size="lg" className="w-full sm:w-auto">
                    Apply Now
                  </Button>
                </Link>
                <Link to="/contractor-auth">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    Contractor Login
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
                Why Partner With <span className="gradient-text">Lawnly</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Join our network of professional contractors and enjoy the benefits 
                of a steady stream of customers.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {benefits.map((benefit) => (
                <Card key={benefit.title} className="text-center hover:shadow-medium transition-shadow">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <benefit.icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{benefit.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">{benefit.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Requirements Section */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
                  What We're Looking For
                </h2>
                <p className="text-lg text-muted-foreground">
                  We partner with reliable, professional lawn care providers who 
                  share our commitment to quality.
                </p>
              </div>
              <Card>
                <CardContent className="pt-6">
                  <ul className="space-y-4">
                    {requirements.map((requirement, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-foreground">{requirement}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="font-display text-3xl font-bold text-foreground mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Apply today and start earning with Lawnly. Our team will review 
                your application and get back to you within 48 hours.
              </p>
              <Link to="/contractor-auth?mode=signup">
                <Button size="lg">
                  Apply to Be a Contractor
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

export default Contractors;
