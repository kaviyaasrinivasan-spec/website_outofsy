import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeCheck, Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, type Membership } from "@/lib/types";

const BENEFITS = [
  "Verified internship opportunities",
  "Career guidance",
  "Skill development programs",
  "Exclusive internship openings",
  "Industry updates",
  "Community events",
];

const MembershipPage = () => {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Membership>("/student/membership")
      .then(setMembership)
      .catch(() => setError("Could not load your membership details."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !membership) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">{error || "Membership unavailable."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-accent to-cyan p-8 text-white">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-sm text-white/80">Membership</p>
              <h2 className="text-3xl font-bold text-white">{membership.tier}</h2>
            </div>
            <ShieldCheck className="h-10 w-10 text-white/80" />
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-xs text-white/70">Member ID</p>
              <p className="font-mono text-lg font-bold">{membership.member_id}</p>
            </div>
            <div>
              <p className="text-xs text-white/70">Member Since</p>
              <p className="text-lg font-bold">{formatDate(membership.started_at)}</p>
            </div>
            <div>
              <p className="text-xs text-white/70">Status</p>
              <p className="text-lg font-bold">
                {membership.is_active ? "Active" : "Inactive"}
              </p>
            </div>
            {membership.expires_at && (
              <div>
                <p className="text-xs text-white/70">Valid Until</p>
                <p className="text-lg font-bold">{formatDate(membership.expires_at)}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <h3 className="mb-5 text-xl font-bold">Your Membership Benefits</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-center gap-3 rounded-lg bg-secondary p-3.5">
                <BadgeCheck className="h-5 w-5 shrink-0 text-accent" />
                <span className="text-sm font-medium">{b}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            OOS membership is free for every registered student.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MembershipPage;
