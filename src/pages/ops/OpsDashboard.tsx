import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, Building2, GraduationCap, Briefcase, FileText,
  Award, Clock, AlertTriangle, ArrowRight, Activity,
  UserPlus, CheckCircle2, Loader2
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { api } from "@/lib/api";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const PIE_COLORS: Record<string, string> = {
  "In Progress": "#6366f1",
  "Completed": "#10b981",
  "Applied/Others": "#3b82f6",
};

const StatCard = ({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) => (
  <Card className="hover-lift">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
          <div className="text-2xl font-bold text-foreground">{value}</div>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const OpsDashboard = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/ops/dashboard")
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load dashboard data");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-center text-red-500">{error || "No data available"}</div>;
  }

  const pendingTotal = Object.values(data.pending_approvals).reduce((a: any, b: any) => a + b, 0) as number;

  const STATS = [
    { label: "Total Students", value: data.totals.students, icon: Users, color: "bg-blue-500" },
    { label: "Total Companies", value: data.totals.companies, icon: Building2, color: "bg-purple-500" },
    { label: "Total Colleges", value: data.totals.colleges, icon: GraduationCap, color: "bg-indigo-500" },
    { label: "Active Programs", value: data.totals.active_internships, icon: Briefcase, color: "bg-accent" },
    { label: "Applications", value: data.totals.applications, icon: FileText, color: "bg-cyan-500" },
    { label: "Students Placed", value: data.totals.students_placed, icon: CheckCircle2, color: "bg-emerald-500" },
    { label: "In Progress", value: data.totals.in_progress, icon: Activity, color: "bg-amber-500" },
    { label: "Certificates Issued", value: data.totals.certificates_issued, icon: Award, color: "bg-rose-500" },
    { label: "Pending Approvals", value: pendingTotal, icon: Clock, color: "bg-orange-500" },
    { label: "Registrations Today", value: data.new_registrations_today, icon: UserPlus, color: "bg-teal-500" },
  ];

  const NOTIFICATIONS = [
    ...(data.pending_approvals.companies > 0 ? [{ title: `${data.pending_approvals.companies} companies pending approval`, type: "warning", icon: AlertTriangle }] : []),
    ...(data.pending_approvals.colleges > 0 ? [{ title: `${data.pending_approvals.colleges} colleges pending approval`, type: "warning", icon: AlertTriangle }] : []),
    ...(data.pending_approvals.internships > 0 ? [{ title: `${data.pending_approvals.internships} internships pending approval`, type: "warning", icon: AlertTriangle }] : []),
    ...(data.pending_approvals.documents > 0 ? [{ title: `${data.pending_approvals.documents} documents need verification`, type: "info", icon: FileText }] : []),
    ...(data.pending_approvals.certificates > 0 ? [{ title: `${data.pending_approvals.certificates} certificates ready for download`, type: "success", icon: Award }] : []),
  ];

  if (NOTIFICATIONS.length === 0) {
    NOTIFICATIONS.push({ title: "All caught up! No pending approvals.", type: "success", icon: CheckCircle2 });
  }

  const PIE_DATA = [
    { name: "In Progress", value: data.totals.in_progress, color: PIE_COLORS["In Progress"] },
    { name: "Completed", value: data.totals.completed, color: PIE_COLORS["Completed"] },
    { name: "Applied/Others", value: Math.max(0, data.totals.applications - data.totals.in_progress - data.totals.completed), color: PIE_COLORS["Applied/Others"] },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Operations Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time overview from your database</p>
      </div>

      {/* Alert bar */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {NOTIFICATIONS.map((n, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3",
              n.type === "warning" ? "border-amber-200 bg-amber-50" :
              n.type === "success" ? "border-emerald-200 bg-emerald-50" :
              "border-blue-200 bg-blue-50",
            )}
          >
            <n.icon className={cn("h-4 w-4 shrink-0", n.type === "warning" ? "text-amber-600" : n.type === "success" ? "text-emerald-600" : "text-blue-600")} />
            <p className="text-xs font-medium text-slate-700">{n.title}</p>
          </div>
        ))}
      </div>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {STATS.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Trend - takes 2/3 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Student Registration Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.registration_trend}>
                <defs>
                  <linearGradient id="colorStudents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Students" stroke="#6366f1" fill="url(#colorStudents)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Internship Status</CardTitle>
          </CardHeader>
          <CardContent>
            {PIE_DATA.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={PIE_DATA} cx="50%" cy="45%" innerRadius={55} outerRadius={85} dataKey="value">
                    {PIE_DATA.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                No application data yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tables + Activity row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top Colleges */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Top Colleges</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.top_colleges.length > 0 ? data.top_colleges.map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">{c.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-accent">{c.students}</p>
                  <p className="text-[10px] text-muted-foreground">students</p>
                </div>
              </div>
            )) : <p className="text-xs text-muted-foreground text-center py-4">No data available</p>}
          </CardContent>
        </Card>

        {/* Top Companies */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Top Companies</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.top_companies.length > 0 ? data.top_companies.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">{i + 1}</span>
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-medium truncate">{c.name}</p>
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <p className="text-xs font-bold text-amber-500">{c.applications}</p>
                  <p className="text-[10px] text-muted-foreground">apps</p>
                </div>
              </div>
            )) : <p className="text-xs text-muted-foreground text-center py-4">No data available</p>}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Activity Logs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recent_activity.length > 0 ? data.recent_activity.map((a: any, i: number) => (
              <div key={i} className="flex items-start gap-3">
                <div className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", a.action === 'created' ? 'bg-emerald-500' : a.action === 'deleted' ? 'bg-rose-500' : 'bg-blue-500')} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-700">{a.summary || `${a.action} ${a.entity}`}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(a.at).toLocaleString()}</p>
                </div>
              </div>
            )) : <p className="text-xs text-muted-foreground text-center py-4">No recent activity.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OpsDashboard;
