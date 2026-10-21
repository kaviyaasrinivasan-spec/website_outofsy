import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Bookmark, Briefcase, ClipboardList, Loader2, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardOverview } from "@/lib/types";

const Overview = () => {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<DashboardOverview>("/student/overview")
      .then(setData)
      .catch(() => setError("Could not load your dashboard right now."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">{error || "No data available."}</p>
        </CardContent>
      </Card>
    );
  }

  const tiles = [
    { label: "Active Applications", value: data.active_applications, icon: ClipboardList, to: "/dashboard/applications" },
    { label: "Total Applications", value: data.total_applications, icon: TrendingUp, to: "/dashboard/applications" },
    { label: "Saved Internships", value: data.saved_internships, icon: Bookmark, to: "/dashboard/saved" },
    { label: "Unread Notifications", value: data.unread_notifications, icon: Bell, to: "/dashboard/notifications" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, to }) => (
          <Link key={label} to={to}>
            <Card className="hover-lift h-full">
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <div className="text-3xl font-bold">{value}</div>
                <p className="text-sm text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Nudge to finish the profile -- only while it's incomplete */}
      {data.profile_completion < 100 && (
        <Card>
          <CardContent className="p-6">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold">Complete your profile</h3>
                <p className="text-sm text-muted-foreground">
                  A complete profile helps companies find you.
                </p>
              </div>
              <span className="shrink-0 text-2xl font-bold text-accent">
                {data.profile_completion}%
              </span>
            </div>
            <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-cyan transition-all"
                style={{ width: `${data.profile_completion}%` }}
              />
            </div>
            <Link to="/dashboard/profile">
              <Button variant="gradient" size="sm">
                Update Profile
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6 text-center">
          <Briefcase className="mx-auto mb-3 h-10 w-10 text-accent/40" />
          <h3 className="mb-2 font-bold">Looking for your next opportunity?</h3>
          <p className="mb-5 text-sm text-muted-foreground">
            Browse verified internships from companies hiring right now.
          </p>
          <Link to="/internships">
            <Button variant="gradient">Browse Internships</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default Overview;
