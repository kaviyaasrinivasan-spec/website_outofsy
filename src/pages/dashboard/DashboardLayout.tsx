import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Bell, Bookmark, ClipboardList, LayoutDashboard, LogOut, User, Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { to: "/dashboard", end: true, label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/profile", label: "My Profile", icon: User },
  { to: "/dashboard/applications", label: "Applications", icon: ClipboardList },
  { to: "/dashboard/saved", label: "Saved", icon: Bookmark },
  { to: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { to: "/dashboard/membership", label: "Membership", icon: Wallet },
];

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 bg-gradient-subtle py-6 sm:py-10">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="mb-1 text-2xl font-bold sm:text-3xl">
                Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
              </h1>
              <p className="text-sm text-muted-foreground">
                {user?.member_id && (
                  <span className="mr-2 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                    {user.member_id}
                  </span>
                )}
                {user?.email}
              </p>
            </div>
            <Button variant="outline" className="w-full sm:w-auto" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            {/* Section nav -- horizontal scroll on mobile, sidebar on desktop */}
            <nav className="w-full max-w-full overflow-hidden lg:sticky lg:top-24 lg:self-start">
              <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {SECTIONS.map(({ to, end, label, icon: Icon }) => (
                  <li key={to} className="shrink-0">
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="min-w-0">
              <Outlet />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DashboardLayout;
