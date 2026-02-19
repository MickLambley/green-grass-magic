import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const Privacy = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20 md:pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Last Updated: 10 February 2026
          </p>

          <div className="space-y-10 text-foreground/90 text-[15px] leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-display font-semibold text-foreground">1. Introduction</h2>
              <p>Lawnly Pty Ltd (ABN: [insert ABN]) ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and disclose your personal information.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-semibold text-foreground">2. Information We Collect</h2>
              <p>We collect personal information including your name, email address, phone number, property address, payment details, and before-and-after photos of your property.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-semibold text-foreground">3. How We Use Your Information</h2>
              <p>We use your information to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Provide the Lawnly platform services</li>
                <li>Process payments</li>
                <li>Facilitate communication between you and contractors</li>
                <li>Improve our services</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-semibold text-foreground">4. Photo Collection</h2>
              <p>Contractors take before-and-after photos of your property for quality assurance and dispute resolution. We will not use these photos for marketing without your express consent.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-semibold text-foreground">5. Disclosure to Third Parties</h2>
              <p>We may disclose your information to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Contractors who provide services to you</li>
                <li>Payment processors (Stripe)</li>
                <li>Law enforcement or regulatory authorities if required by law</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-semibold text-foreground">6. Security</h2>
              <p>We take reasonable steps to protect your personal information from misuse, interference, loss, unauthorized access, modification, or disclosure. Your information is stored securely on cloud servers located in Australia.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-semibold text-foreground">7. Your Rights</h2>
              <p>You have the right to access, correct, or request deletion of your personal information. Contact us at <a href="mailto:admin@lawnly.com.au" className="text-primary hover:underline">admin@lawnly.com.au</a>.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-display font-semibold text-foreground">8. Contact Us</h2>
              <p>If you have any questions about this Privacy Policy, please contact us at <a href="mailto:admin@lawnly.com.au" className="text-primary hover:underline">admin@lawnly.com.au</a>.</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
