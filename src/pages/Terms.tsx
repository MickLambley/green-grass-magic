import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const Terms = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20 md:pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-2">
            Terms &amp; Conditions
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Last Updated: 10 February 2026
          </p>

          <div className="space-y-10 text-foreground/90 text-[15px] leading-relaxed">
            {/* Section 1 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">
                1. Platform Role and Relationship
              </h2>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">1.1 Nature of the Platform</h3>
                <p>Lawnly operates as a technology platform that connects customers seeking lawn care services with independent, third-party contractors who provide those services. Lawnly does not provide lawn care services itself.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">1.2 Contract Formation</h3>
                <p>When you book a service through the Lawnly platform, you are entering into a contract directly with the contractor who accepts your booking. Lawnly is not a party to that contract and has no control over the quality, timing, legality, or any other aspect of the services provided by contractors.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">1.3 Independent Contractors</h3>
                <p>All contractors on the Lawnly platform are independent contractors, not employees, agents, or representatives of Lawnly. Contractors are solely responsible for their own actions, omissions, and compliance with all applicable laws.</p>
              </div>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">
                2. Limitation of Liability
              </h2>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">2.1 No Liability for Contractor Actions</h3>
                <p>To the maximum extent permitted by law, Lawnly is not liable for any acts, errors, omissions, representations, warranties, breaches, or negligence of any contractor, or for any personal injuries, death, property damage, or other damages or expenses resulting from contractor services.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">2.2 Limitation of Platform Liability</h3>
                <p>Lawnly's total liability to you for any claim arising out of or relating to your use of the platform or any services booked through it, whether in contract, tort, or otherwise, is limited to the total amount of fees you paid to Lawnly in the 12 months prior to the event giving rise to the claim.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">2.3 Consumer Law Rights</h3>
                <p>Nothing in these Terms excludes, restricts, or modifies any consumer rights or remedies that cannot be excluded, restricted, or modified under the Australian Consumer Law or other applicable law.</p>
              </div>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">
                3. Contractor Requirements and Insurance
              </h2>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">3.1 Contractor Obligations</h3>
                <p>All contractors on the Lawnly platform must:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Hold a valid Australian Business Number (ABN) and be registered for GST if required</li>
                  <li>Maintain current Public Liability Insurance with a minimum coverage of $5,000,000</li>
                  <li>Comply with all applicable laws, regulations, and industry standards</li>
                  <li>Provide services with due care, skill, and in a professional manner</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">3.2 Insurance Verification</h3>
                <p>Lawnly reserves the right to request proof of insurance from any contractor at any time. Contractors who fail to provide satisfactory proof may be suspended or removed from the platform.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">3.3 No Warranty of Insurance</h3>
                <p>While Lawnly requires contractors to maintain insurance, we do not verify or warrant that any contractor has current or adequate insurance coverage. You should request proof of insurance directly from your contractor if you have concerns.</p>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">
                4. Photo Collection and Use
              </h2>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">4.1 Photo Collection</h3>
                <p>As part of the service, contractors are required to take before-and-after photos of your property. By booking a service, you consent to the collection of these photos.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">4.2 Purpose of Photos</h3>
                <p>Photos are collected solely for the purposes of:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Quality assurance and verification of service completion</li>
                  <li>Dispute resolution between you and the contractor</li>
                  <li>Platform safety and integrity</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">4.3 Use and Disclosure</h3>
                <p>Lawnly will not use your property photos for marketing or any other purpose without your separate, express written consent. Photos may be shared with the contractor who performed the service and with Lawnly staff for the purposes outlined in clause 4.2.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">4.4 Storage and Security</h3>
                <p>We take reasonable steps to protect the photos we collect from misuse, interference, loss, unauthorized access, modification, or disclosure. Photos are stored securely on cloud servers located in Australia.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">4.5 Your Rights</h3>
                <p>You may request access to, correction of, or deletion of photos of your property by contacting us at <a href="mailto:admin@lawnly.com.au" className="text-primary hover:underline">admin@lawnly.com.au</a>. We will respond to your request within a reasonable timeframe.</p>
              </div>
            </section>

            {/* Section 5 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">
                5. Payment and Dispute Resolution
              </h2>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">5.1 Payment Processing</h3>
                <p>All payments are processed securely through our third-party payment provider, Stripe. By making a payment, you agree to Stripe's terms and conditions.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">5.2 Payment Hold and Release</h3>
                <p>When you book a service, your payment method is saved but you are not charged until a contractor accepts your job. Once accepted, payment is captured and held securely. Payment is released to the contractor when:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>You mark the job as complete in the platform; OR</li>
                  <li>48 hours have passed since the contractor marked the job as complete, and you have not raised a dispute.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">5.3 Raising a Dispute</h3>
                <p>If you are not satisfied with the service provided, you may raise a dispute within 7 days of the contractor marking the job as complete. To raise a dispute, log into your account and select "Report Issue" on the relevant booking, or contact us at <a href="mailto:admin@lawnly.com.au" className="text-primary hover:underline">admin@lawnly.com.au</a>.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">5.4 Dispute Process</h3>
                <p>When a dispute is raised:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Payment to the contractor will be paused</li>
                  <li>Lawnly will facilitate communication between you and the contractor to attempt to resolve the issue</li>
                  <li>Lawnly may, at its discretion, issue a full or partial refund, require the contractor to redo the work, or take other action it deems appropriate</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">5.5 Final Decision</h3>
                <p>Lawnly's decision in relation to any dispute is final, except where you have rights under the Australian Consumer Law or other applicable law that cannot be excluded.</p>
              </div>
            </section>

            {/* Section 6 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">
                6. Acceptable Use
              </h2>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">6.1 Prohibited Conduct</h3>
                <p>You must not:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Use the platform for any unlawful purpose or in violation of these Terms</li>
                  <li>Harass, abuse, or harm (or attempt to do so) any other user or contractor</li>
                  <li>Provide false or misleading information</li>
                  <li>Attempt to circumvent the platform by arranging direct payment to contractors</li>
                  <li>Post or transmit any content that is defamatory, offensive, or infringes the rights of others</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">6.2 Termination</h3>
                <p>Lawnly reserves the right to suspend or terminate your access to the platform at any time, without notice, if we believe you have breached these Terms or engaged in conduct that is harmful to the platform or other users.</p>
              </div>
            </section>

            {/* Section 7 */}
            <section className="space-y-4">
              <h2 className="text-xl font-display font-semibold text-foreground">
                7. Governing Law and Jurisdiction
              </h2>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">7.1 Governing Law</h3>
                <p>These Terms are governed by the laws of New South Wales, Australia. You irrevocably submit to the exclusive jurisdiction of the courts of New South Wales.</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">7.2 Severability</h3>
                <p>If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will continue in full force and effect.</p>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
