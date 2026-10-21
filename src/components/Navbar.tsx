import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import oosLogo from "@/assets/oos-logo.png";

const NAV_LINKS = [
  { name: "Internships", path: "/internships" },
  { name: "About", path: "/about" },
  { name: "Contact", path: "/contact" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    navigate("/");
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "font-medium transition-colors",
      isActive ? "text-accent" : "text-foreground/80 hover:text-foreground",
    );

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex h-20 items-center justify-between">
          <Link to="/" className="flex shrink-0 items-center">
            <img src={oosLogo} alt="Out Of Syllabus" className="h-12" />
          </Link>

          {/* Desktop */}
          <div className="hidden items-center space-x-8 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.path} to={link.path} className={linkClass}>
                {link.name}
              </NavLink>
            ))}

            {loading ? null : user ? (
              <div className="flex items-center gap-3">
                <Link to="/dashboard">
                  <Button variant="hero" size="default">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out">
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/login">
                  <Button variant="ghost" size="default">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="gradient" size="default">
                    Join OOS
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="p-2 md:hidden"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile */}
        {isOpen && (
          <div className="animate-fade-up py-4 md:hidden">
            <div className="flex flex-col space-y-4">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  className={linkClass}
                  onClick={() => setIsOpen(false)}
                >
                  {link.name}
                </NavLink>
              ))}

              {loading ? null : user ? (
                <>
                  <Link to="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button variant="hero" className="w-full">
                      Dashboard
                    </Button>
                  </Link>
                  <Button variant="outline" className="w-full" onClick={handleLogout}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/register" onClick={() => setIsOpen(false)}>
                    <Button variant="gradient" className="w-full">
                      Join OOS
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
