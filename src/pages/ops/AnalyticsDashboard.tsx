import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/** Categorical hues in fixed order, validated for colour-vision separation.
 *  Only used where slices carry identity; magnitude charts use one hue. */
const CATEGORICAL = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"];
const ONE_HUE = "#6366f1";
const GRID = "#f1f5f9";

interface MonthPoint { month: string; count: number }
interface Analytics {
  student_growth: MonthPoint[];
  applications_per_month: MonthPoint[];
  placements_per_month: MonthPoint[];
  application_status_breakdown: { status: string; count: number }[];
  popular_skills: { skill: string; count: number }[];
  top_companies: { company: string; applications: number }[];
  top_colleges: { college: string; students: number }[];
  course_distribution: { course: string; count: number }[];
  work_mode_distribution: { mode: string; count: number }[];
  conversion: { total_applications: number; placed: number; placement_rate_percent: number };
}

/** "2026-08" -> "Aug 26", so the axis stays readable at 12 points. */
const shortMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  if (!m) return ym;
  const name = new Date(Number(y), Number(m) - 1, 1).toLocaleString(undefined, { month: "short" });
  return `${name} ${y.slice(2)}`;
};

const prettyStatus = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const EmptyChart = ({ note }: { note: string }) => (
  <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border">
    <p className="px-6 text-center text-sm text-muted-foreground">{note}</p>
  </div>
);

/** Horizontal magnitude bars: one hue, values labelled directly so the chart
 *  never depends on colour alone. */
const MagnitudeBars = ({
  data, categoryKey, valueKey, height = 260, note,
}: {
  data: any[];
  categoryKey: string;
  valueKey: string;
  height?: number;
  note: string;
}) => {
  if (!data.length) return <EmptyChart note={note} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
        <YAxis
          dataKey={categoryKey}
          type="category"
          tick={{ fontSize: 10, fill: "#475569" }}
          width={130}
        />
        <Tooltip />
        <Bar dataKey={valueKey} fill={ONE_HUE} radius={[0, 4, 4, 0]} barSize={14}>
          <LabelList dataKey={valueKey} position="right" style={{ fontSize: 10, fill: "#64748b" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/** Top-10 identity + magnitude reads better as a table than as ten bars, and it
 *  doubles as the accessible table view for the charts beside it. */
const RankTable = ({
  rows, nameKey, valueKey, nameHead, valueHead, note,
}: {
  rows: any[];
  nameKey: string;
  valueKey: string;
  nameHead: string;
  valueHead: string;
  note: string;
}) => {
  if (!rows.length) return <EmptyChart note={note} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            <th className="w-8 py-2 text-left text-xs font-semibold text-muted-foreground">#</th>
            <th className="py-2 text-left text-xs font-semibold text-muted-foreground">{nameHead}</th>
            <th className="py-2 text-right text-xs font-semibold text-muted-foreground">{valueHead}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r[nameKey]}-${i}`} className="border-b last:border-0">
              <td className="py-2 text-xs text-muted-foreground">{i + 1}</td>
              <td className="py-2 font-medium text-slate-800">{r[nameKey] || "(not set)"}</td>
              <td className="py-2 text-right font-semibold text-slate-700">{r[valueKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AnalyticsDashboard = () => {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [months, setMonths] = useState(12);

  useEffect(() => {
    setLoading(true);
    api.get<Analytics>(`/ops/analytics?months=${months}`)
      .then((res) => {
        setData(res);
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Could not load analytics.");
        setData(null);
        setLoading(false);
      });
  }, [months]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm text-rose-600">
        {error || "No analytics available."}
      </div>
    );
  }

  const growth = data.student_growth.map((p) => ({ ...p, label: shortMonth(p.month) }));
  const apps = data.applications_per_month.map((p) => ({ ...p, label: shortMonth(p.month) }));
  const placements = data.placements_per_month.map((p) => ({ ...p, label: shortMonth(p.month) }));
  const statuses = [...data.application_status_breakdown]
    .sort((a, b) => b.count - a.count)
    .map((s) => ({ ...s, label: prettyStatus(s.status) }));
  const workMode = data.work_mode_distribution.filter((w) => w.count > 0);
  const courses = [...data.course_distribution].sort((a, b) => b.count - a.count).slice(0, 10);
  const skills = data.popular_skills.slice(0, 10);

  const tiles = [
    { label: "Total Applications", value: data.conversion.total_applications },
    { label: "Students Placed", value: data.conversion.placed },
    { label: "Placement Rate", value: `${data.conversion.placement_rate_percent}%` },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analytics Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live figures from your database</p>
        </div>
        <select
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
        >
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
      </div>

      {/* Headline numbers -- three figures, no chart needed */}
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-white p-4">
            <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-bold text-slate-800">{t.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="internships">Internships</TabsTrigger>
          <TabsTrigger value="placements">Placements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Student Registrations</CardTitle>
              </CardHeader>
              <CardContent>
                {growth.length === 0 ? (
                  <EmptyChart note="No students have registered in this period." />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={growth}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={ONE_HUE} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={ONE_HUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                      <Tooltip />
                      <Area
                        type="monotone" dataKey="count" name="Students"
                        stroke={ONE_HUE} fill="url(#g1)" strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Applications per Month</CardTitle>
              </CardHeader>
              <CardContent>
                {apps.length === 0 ? (
                  <EmptyChart note="No applications were submitted in this period." />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={apps}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Applications" fill={ONE_HUE} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Applications by Stage</CardTitle>
            </CardHeader>
            <CardContent>
              <MagnitudeBars
                data={statuses} categoryKey="label" valueKey="count" height={300}
                note="No applications yet, so there are no stages to break down."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Course Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <MagnitudeBars
                  data={courses} categoryKey="course" valueKey="count"
                  note="No student has recorded a course yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Popular Skills</CardTitle>
              </CardHeader>
              <CardContent>
                {skills.length === 0 ? (
                  <EmptyChart note="No student has listed any skills yet." />
                ) : (
                  <div className="space-y-3">
                    {skills.map((s, i) => (
                      <div key={s.skill} className="flex items-center gap-3">
                        <span className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="font-medium text-slate-700">{s.skill}</span>
                            <span className="text-muted-foreground">{s.count}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-accent to-cyan"
                              style={{ width: `${(s.count / skills[0].count) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Top Colleges by Students</CardTitle>
            </CardHeader>
            <CardContent>
              <RankTable
                rows={data.top_colleges} nameKey="college" valueKey="students"
                nameHead="College" valueHead="Students"
                note="No student has recorded a college yet."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="internships" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Work Mode</CardTitle>
              </CardHeader>
              <CardContent>
                {workMode.length === 0 ? (
                  <EmptyChart note="No internships have a work mode set." />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={workMode} cx="50%" cy="45%" innerRadius={60} outerRadius={95}
                        dataKey="count" nameKey="mode" stroke="#ffffff" strokeWidth={2}
                        label={({ mode, count }: any) => `${mode}: ${count}`}
                        labelLine={false}
                      >
                        {workMode.map((_, i) => (
                          <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                        ))}
                      </Pie>
                      <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Top Companies by Applications</CardTitle>
              </CardHeader>
              <CardContent>
                <RankTable
                  rows={data.top_companies} nameKey="company" valueKey="applications"
                  nameHead="Company" valueHead="Applications"
                  note="No company has received an application yet."
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="placements" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Placements per Month</CardTitle>
            </CardHeader>
            <CardContent>
              {placements.length === 0 ? (
                <EmptyChart note="No students have been placed in this period." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={placements}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone" dataKey="count" name="Placements"
                      stroke={ONE_HUE} strokeWidth={2} dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Placement Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <RankTable
                rows={statuses} nameKey="label" valueKey="count"
                nameHead="Stage" valueHead="Applications"
                note="No applications yet."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsDashboard;
