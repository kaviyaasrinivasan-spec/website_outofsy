import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Building2, GraduationCap, Briefcase,
  FileText, BarChart3, MessageSquare, Settings, ChevronDown,
  ChevronRight, LogOut, Menu, X, Bell, Shield, Database,
  ScrollText, ClipboardCheck, Award, UserCog, FolderOpen,
  TrendingUp, CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import oosLogo from "@/assets/oos-logo.png";

interface NavItem {
  label: string;
  icon: React.ElementType;
  to?: string;
  children?: { label: string; to: string }[];
}

const NAV: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/ops" },
  {
    label: "Operations", icon: ClipboardCheck, children: [
      { label: "Student Management", to: "/ops/students" },
      { label: "Internship Tracking", to: "/ops/registrations" },
      { label: "Certificates", to: "/ops/certificates" },
    ],
  },
  {
    label: "Company", icon: Building2, children: [
      { label: "Companies", to: "/ops/companies" },
      { label: "Company HR", to: "/ops/company-hr" },
      { label: "Internship Programs", to: "/ops/internship-programs" },
    ],
  },
  {
    label: "College", icon: GraduationCap, children: [
      { label: "Colleges", to: "/ops/colleges" },
      { label: "College Coordinators", to: "/ops/coordinators" },
    ],
  },
  {
    label: "Internships", icon: Briefcase, children: [
      { label: "All Internships", to: "/ops/internships" },
      { label: "Create Internship", to: "/ops/internships/create" },
      { label: "Applications", to: "/ops/applications" },
      { label: "Placements", to: "/ops/placements" },
    ],
  },
  {
    label: "Reports", icon: BarChart3, children: [
      { label: "Student Reports", to: "/ops/reports/students" },
      { label: "Company Reports", to: "/ops/reports/companies" },
      { label: "College Reports", to: "/ops/reports/colleges" },
      { label: "Internship Reports", to: "/ops/reports/internships" },
      { label: "Analytics", to: "/ops/analytics" },
    ],
  },
  {
    label: "Communication", icon: MessageSquare, children: [
      { label: "Email", to: "/ops/comm/email" },
      { label: "WhatsApp", to: "/ops/comm/whatsapp" },
      { label: "SMS", to: "/ops/comm/sms" },
      { label: "Notifications", to: "/ops/comm/notifications" },
    ],
  },
  {
    label: "Administration", icon: Shield, children: [
      { label: "Users", to: "/ops/admin/users" },
      { label: "Roles & Permissions", to: "/ops/admin/roles" },
      { label: "Master Data", to: "/ops/admin/master-data" },
      { label: "Documents", to: "/ops/admin/documents" },
      { label: "Audit Logs", to: "/ops/admin/audit" },
      { label: "System Settings", to: "/ops/admin/settings" },
    ],
  },
  { label: "Approval Center", icon: CheckSquare, to: "/ops/approvals" },
];

const SidebarItem = ({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) => {
  const [open, setOpen] = useState(false);

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        end={item.to === "/ops"}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
            isActive
              ? "bg-accent text-white shadow-sm"
              : "text-slate-300 hover:bg-white/10 hover:text-white",
          )
        }
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
          open ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white",
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </>
        )}
      </button>

      {!collapsed && open && item.children && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-4">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2 text-xs font-medium transition-all",
                  isActive
                    ? "bg-accent/80 text-white"
                    : "text-slate-400 hover:bg-white/10 hover:text-white",
                )
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

const OpsLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  /** Real backlog behind the bell. limit=1 because only the counts are needed. */
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.get<{ counts?: Record<string, number> }>("/ops/approvals?limit=1")
      .then((res) => {
        const counts = res.counts || {};
        setPendingCount(Object.values(counts).reduce((a, b) => a + (b || 0), 0));
      })
      .catch(() => setPendingCount(0));
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const getSidebarContent = (onNav?: () => void) => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn("flex flex-col items-center border-b border-white/10 py-4", sidebarCollapsed ? "px-2" : "px-4")}>
        <div className={cn("flex w-full items-center justify-center rounded-md bg-white shadow-sm transition-all", sidebarCollapsed ? "h-10 p-1" : "h-14 p-2")}>
          <img 
            src={oosLogo} 
            alt="Out Of Syllabus" 
            className={cn("object-contain transition-all", sidebarCollapsed ? "h-4" : "h-8")} 
          />
        </div>
        {!sidebarCollapsed && (
          <div className="mt-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-accent/90">Operations Portal</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => (
          <SidebarItem key={item.label} item={item} collapsed={sidebarCollapsed} onNavigate={onNav} />
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 p-3">
        <div className={cn("flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2", sidebarCollapsed && "justify-center")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
            {user?.name?.[0]?.toUpperCase() || "A"}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{user?.name || "Admin"}</p>
              <p className="truncate text-xs text-slate-400">{user?.role}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={cn(
            "mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white",
            sidebarCollapsed && "justify-center",
          )}
        >
          <LogOut className="h-3.5 w-3.5" />
          {!sidebarCollapsed && "Sign Out"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "relative hidden flex-col bg-[hsl(218,74%,14%)] transition-all duration-300 lg:flex",
          sidebarCollapsed ? "w-16" : "w-64",
        )}
      >
        {getSidebarContent()}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-[hsl(218,74%,14%)] text-white shadow-md transition hover:bg-accent"
        >
          {sidebarCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 -rotate-90" />}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-[hsl(218,74%,14%)]">
            {getSidebarContent(() => setMobileSidebarOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-white px-4 shadow-sm">
          <button
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-800">Operations Portal</h2>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/ops/approvals"
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              title={pendingCount > 0
                ? `${pendingCount} item(s) awaiting approval`
                : "Nothing awaiting approval"}
            >
              <Bell className="h-5 w-5" />
              {/* Only badge a real backlog -- a dot that is always lit tells nobody anything. */}
              {pendingCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
              {user?.name?.[0]?.toUpperCase() || "A"}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default OpsLayout;
