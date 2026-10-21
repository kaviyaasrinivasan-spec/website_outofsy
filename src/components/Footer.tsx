import { Link } from "react-router-dom";
import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <h3 className="text-2xl font-bold text-gradient">OutOfSyllabuss</h3>
            <p className="text-primary-foreground/80 text-sm">
              Connecting students with real-world wisdom from industry leaders.
              <br /><br />
              ADDRESS: Workvilla 110/1 "Arcade centre"
              Mahatma gandhi road nungambakkam chennai 600034.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Explore</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/internships" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Active Internships
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  About OOS
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Students */}
          <div>
            <h4 className="font-semibold mb-4">For Students</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/register" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Become an OOS Member
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Student Login
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  My Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="font-semibold mb-4">Follow Us</h4>
            <div className="flex space-x-4">
              <a
                href="https://www.facebook.com/profile.php?id=61583994910674"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://x.com/OfSyllabuss"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                aria-label="X (Twitter)"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/out_of_syllabuss_/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.linkedin.com/company/outofsyllabuss-org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-5 w-5" />
              </a>
              <a
                href="https://www.youtube.com/@OutOfSyllabuss-org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                aria-label="YouTube"
              >
                <Youtube className="h-5 w-5" />
              </a>
            </div>
            <div className="mt-4">
              <a
                href="mailto:team@outofsyllabuss.org"
                className="text-primary-foreground/80 hover:text-primary-foreground transition-colors text-sm"
              >
                team@outofsyllabuss.org
              </a>
              <br />
              +91 89395 18163
            </div>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-8 pt-8 text-center text-sm text-primary-foreground/60">
          <p>© 2024 OutOfSyllabuss.org. All rights reserved.</p>
          <p className="mt-2">Powered by AKN Group</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
