import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Dashboard shell.
 *
 * Phase 1 delivers auth and the role-aware frame. The individual panels
 * (applications, internship management, statistics) arrive in Phases 3-4;
 * they are listed here as disabled so the structure is visible.
 */

const PANELS: Record<string, { title: string; items: string[] }> = {
  student: {
    title: "Student Dashboard",
    items: [
      "My Profile",
      "My Applications",
      "Recommended Internships",
      "Saved Internships",
      "Notifications",
      "Membership Details",
    ],
  },
  company: {
    title: "Company Dashboard",
    items: [
      "Company Profile",
      "Post Internship",
      "Manage Internships",
      "View Applications",
      "Shortlisted Candidates",
      "Internship Analytics",
    ],
  },
  college: {
    title: "College Dashboard",
    items: [
      "College Profile",
      "Student Statistics",
      "Partnership Details",
      "Internship Drives",
      "Company Connections",
    ],
  },
  admin: {
    title: "Admin Dashboard",
    items: [
      "Pending Approvals",
      "Manage Users",
      "Review Internships",
      "Platform Statistics",
    ],
  },
};

const Dashboard = () => {
  const { user, logout } = useAuth();
  if (!user) return null; // ProtectedRoute guarantees a user; this satisfies TS

  const panel = PANELS[user.role] ?? PANELS.student;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 bg-gradient-subtle py-12">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="mb-1 text-3xl font-bold">{panel.title}</h1>
                <p className="text-muted-foreground">
                  Signed in as {user.name || user.email}
                  <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {user.role}
                  </span>
                </p>
              </div>
              <Button variant="outline" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {panel.items.map((item) => (
                <Card key={item} className="opacity-60">
                  <CardContent className="p-6">
                    <h3 className="mb-1 font-bold">{item}</h3>
                    <p className="text-sm text-muted-foreground">Coming soon</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Dashboard;
