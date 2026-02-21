import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Leaf, Phone, MapPin, Mail, ChevronRight, Loader2, User } from "lucide-react";


interface WebsiteCopy {
  hero_headline: string;
  hero_subheadline: string;
  about_title: string;
  about_text: string;
  services_title: string;
  services: { name: string; description: string }[];
  cta_headline: string;
  cta_text: string;
}

interface ContractorSite {
  id: string;
  business_name: string | null;
  phone: string | null;
  business_address: string | null;
  business_logo_url: string | null;
  subdomain: string | null;
  website_copy: WebsiteCopy | null;
}

const DEFAULT_COPY: WebsiteCopy = {
  hero_headline: "Your Lawn, Our Expertise",
  hero_subheadline: "Professional lawn care services you can trust.",
  about_title: "About Us",
  about_text: "We provide top-quality lawn care services in your local area. With years of experience, we treat every lawn as if it were our own.",
  services_title: "Our Services",
  services: [
    { name: "Lawn Mowing", description: "Regular mowing to keep your lawn pristine" },
    { name: "Edging & Trimming", description: "Clean borders for a polished look" },
    { name: "Garden Cleanup", description: "Seasonal cleanups and green waste removal" },
  ],
  cta_headline: "Get a Free Quote",
  cta_text: "Book online and we'll get back to you within 24 hours.",
};

const ContractorWebsite = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [contractor, setContractor] = useState<ContractorSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session?.user);
    });
  }, []);

  const handleBookNow = () => {
    if (isLoggedIn) {
      navigate(`/site/${slug}/portal`);
    } else {
      navigate(`/site/${slug}/auth?redirect=portal&action=book`);
    }
  };

  useEffect(() => {
    if (slug) loadContractor();
  }, [slug]);

  const loadContractor = async () => {
    const { data, error } = await supabase
      .from("contractors")
      .select("id, business_name, phone, business_address, business_logo_url, subdomain, website_copy, website_published")
      .eq("subdomain", slug)
      .eq("website_published", true)
      .single();

    if (!error && data) {
      setContractor({
        ...data,
        website_copy: data.website_copy as unknown as WebsiteCopy | null,
      });
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Leaf className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Site Not Found</h1>
          <p className="text-muted-foreground">This contractor website doesn't exist or isn't published yet.</p>
        </div>
      </div>
    );
  }

  const copy = contractor.website_copy || DEFAULT_COPY;
  const name = contractor.business_name || "Lawn Care Pro";

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            {contractor.business_logo_url ? (
              <img src={contractor.business_logo_url} alt={name} className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <Leaf className="w-4 h-4 text-primary-foreground" />
              </div>
            )}
            <span className="font-display font-bold text-foreground">{name}</span>
          </div>
          <div className="flex items-center gap-3">
            {contractor.phone && (
              <a href={`tel:${contractor.phone}`} className="text-sm text-muted-foreground hover:text-foreground hidden sm:flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> {contractor.phone}
              </a>
            )}
            {isLoggedIn ? (
              <Button size="sm" variant="outline" onClick={() => navigate(`/site/${slug}/portal`)}>
                <User className="w-3.5 h-3.5 mr-1" /> My Dashboard
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => navigate(`/site/${slug}/auth`)}>
                <User className="w-3.5 h-3.5 mr-1" /> Login
              </Button>
            )}
            <Button size="sm" onClick={handleBookNow}>
              Book Now
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="gradient-hero py-24 sm:py-32">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-primary-foreground mb-4 animate-fade-in">
              {copy.hero_headline}
            </h1>
            <p className="text-lg sm:text-xl text-primary-foreground/90 max-w-2xl mx-auto mb-8 animate-fade-in">
              {copy.hero_subheadline}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in">
              <Button size="lg" variant="heroOutline" className="border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary" onClick={handleBookNow}>
                Get a Free Quote <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              {contractor.phone && (
                <Button size="lg" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" asChild>
                  <a href={`tel:${contractor.phone}`}>
                    <Phone className="w-4 h-4 mr-2" /> Call Us
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-3xl font-bold text-foreground mb-4">{copy.about_title}</h2>
            <p className="text-muted-foreground text-lg leading-relaxed">{copy.about_text}</p>
            {contractor.business_address && (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" /> {contractor.business_address}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 sm:py-20 bg-muted/50">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="font-display text-3xl font-bold text-foreground text-center mb-10">{copy.services_title}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {copy.services.map((svc, i) => (
              <div key={i} className="bg-card rounded-xl p-6 shadow-sm border border-border hover:shadow-md transition-shadow">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Leaf className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-foreground mb-2">{svc.name}</h3>
                <p className="text-sm text-muted-foreground">{svc.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground mb-4">{copy.cta_headline}</h2>
          <p className="text-muted-foreground text-lg mb-8">{copy.cta_text}</p>
          <Button size="xl" onClick={handleBookNow}>
            Book Online Now <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Leaf className="w-4 h-4 text-primary" />
            <span className="font-display font-semibold text-foreground">{name}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
            {contractor.phone && (
              <a href={`tel:${contractor.phone}`} className="flex items-center gap-1 hover:text-foreground">
                <Phone className="w-3.5 h-3.5" /> {contractor.phone}
              </a>
            )}
            {contractor.business_address && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {contractor.business_address}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Powered by <span className="font-semibold text-primary">Yardly</span>
          </p>
        </div>
      </footer>

    </div>
  );
};

export default ContractorWebsite;
