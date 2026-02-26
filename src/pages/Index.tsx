import { lazy, Suspense } from "react";
import Navbar from "@/components/layout/Navbar";
import HeroSection from "@/components/landing/HeroSection";

const FeaturesSection = lazy(() => import("@/components/landing/FeaturesSection"));
const PricingSection = lazy(() => import("@/components/landing/PricingSection"));
const CTASection = lazy(() => import("@/components/landing/CTASection"));
const Footer = lazy(() => import("@/components/layout/Footer"));

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection />
        <Suspense fallback={<div className="min-h-[200px]" />}>
          <FeaturesSection />
          <PricingSection />
          <CTASection />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
};

export default Index;
