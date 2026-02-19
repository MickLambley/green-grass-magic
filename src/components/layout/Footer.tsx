import { Link } from "react-router-dom";
import { Leaf, Mail, Phone, MapPin } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-grass-dark text-primary-foreground">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                <Leaf className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-display font-bold">Lawnly</span>
            </Link>
            <p className="text-primary-foreground/80 text-sm leading-relaxed">
              Professional lawn care made simple. Book, track, and enjoy a
              perfectly maintained lawn without the hassle.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-3">
              {["Home", "About", "Services", "Pricing", "Contact"].map(
                (link) => (
                  <li key={link}>
                    <Link
                      to={link === "Home" ? "/" : `/${link.toLowerCase()}`}
                      className="text-primary-foreground/80 hover:text-primary-foreground transition-colors text-sm"
                    >
                      {link}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-display font-semibold mb-4">Services</h4>
            <ul className="space-y-3">
              {[
                "Lawn Mowing",
                "Edge Trimming",
                "Leaf Cleanup",
                "Fertilizing",
                "Seasonal Care",
              ].map((service) => (
                <li key={service}>
                  <span className="text-primary-foreground/80 text-sm">
                    {service}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display font-semibold mb-4">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-primary-foreground/80 text-sm">
                <Mail className="w-4 h-4" />
                hello@lawnly.com
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/80 text-sm">
                <Phone className="w-4 h-4" />
                (555) 123-4567
              </li>
              <li className="flex items-start gap-3 text-primary-foreground/80 text-sm">
                <MapPin className="w-4 h-4 mt-0.5" />
                123 Green Street, Lawn City, LC 12345
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-primary-foreground/60 text-sm">
            © {currentYear} Lawnly. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link
              to="/privacy"
              className="text-primary-foreground/60 hover:text-primary-foreground text-sm transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              to="/terms"
              className="text-primary-foreground/60 hover:text-primary-foreground text-sm transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
