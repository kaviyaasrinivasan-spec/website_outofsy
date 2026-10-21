import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Plus, Trash2, Eye, Lock, Activity,
  Building2, CheckCircle2, XCircle, Shield, Loader2, Copy, Mail,
} from "lucide-react";
import { api } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-rose-100 text-rose-700",
};

/** As returned by GET /ops/users -- company and college arrive nested. */
interface HRUser {
  id: number;
  email: string;
  role: string;
  status: string;
  full_name: string | null;
  phone: string | null;
  email_verified: boolean;
  /** false while the account is still on its one-time password. */
  password_set: boolean;
  company: { id: number | null; name: string | null } | null;
  /** Internships this HR created, and applications they acted on. Both are
   *  derived from the audit log server-side. */
  internships_posted: number;
  applications_reviewed: number;
  last_login_at: string | null;
  created_at: string | null;
}

interface CompanyOption {
  id: number;
  name: string;
}

interface AuditEntry {
  id: number;
  action: string;
  entity_type: string | null;
  summary: string | null;
  actor_email: string | null;
  created_at: string | null;
}

/** Credentials are returned exactly once by the server, so they live in state
 *  until staff dismisses them -- there is no second chance to read them. */
interface IssuedCredentials {
  email: string;
  full_name: string | null;
  password: string;
  emailed: boolean;
  skippedReason: string | null;
  heading: string;
}

const RESOURCE_LABELS: Record<string, string> = {
  students: "Students",
  companies: "Companies",
  colleges: "Colleges",
  internships: "Internships",
  applications: "Applications",
  progress: "Intern Progress",
  certificates: "Certificates",
  documents: "Documents",
  reports: "Reports",
  communications: "Communications",
  users: "Users",
  master_data: "Master Data",
  audit_logs: "Audit Logs",
  settings: "Settings",
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "—";

const blankForm = { full_name: "", email: "", phone: "", password: "", company_id: "" };

const CompanyHRManagement = () => {
  const [hrUsers, setHrUsers] = useState<HRUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [viewHR, setViewHR] = useState<HRUser | null>(null);

  // Company list comes from the Companies table, so newly registered
  // companies show up in every dropdown below with no code change.
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [logSearch, setLogSearch] = useState("");

  const [formData, setFormData] = useState(blankForm);
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [credentials, setCredentials] = useState<IssuedCredentials | null>(null);

  /** Which row has a request in flight, so its buttons cannot be double-fired. */
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchHRUsers = () => {
    setLoading(true);
    api.get<{ items?: HRUser[] }>("/ops/users?role=company_hr&page=1&page_size=200")
      .then((res) => {
        setHrUsers(res.items || []);
        setLoading(false);
      })
      .catch(() => {
        setHrUsers([]);
        setLoading(false);
      });
  };

  const loadCompanies = () => {
    setCompaniesLoading(true);
    api.get<{ items?: CompanyOption[] }>("/ops/companies?page=1&page_size=200&is_active=true")
      .then((res) => {
        setCompanies(res.items || []);
        setCompaniesLoading(false);
      })
      .catch(() => {
        setCompanies([]);
        setCompaniesLoading(false);
      });
  };

  useEffect(() => {
    fetchHRUsers();
    loadCompanies();
    // Permissions are held per role, not per user, so one fetch covers the tab.
    api.get<{ matrix?: Record<string, Record<string, string[]>> }>("/ops/permissions")
      .then((res) => setRolePermissions(res.matrix?.company_hr || {}))
      .catch(() => setRolePermissions({}));
    api.get<{ items?: AuditEntry[] }>("/ops/audit-logs?page=1&page_size=200")
      .then((res) => setLogs(res.items || []))
      .catch(() => setLogs([]));
  }, []);

  const openForm = () => {
    setFormData(blankForm);
    setFormError("");
    setSendEmail(true);
    loadCompanies(); // pick up companies registered since this page loaded
    setShowForm(true);
  };

  const handleCreateHR = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim() || !formData.email.trim() || !formData.company_id) {
      setFormError("Full name, work email and company are all required.");
      return;
    }
    setFormError("");
    setSaving(true);
    api.post<any>("/ops/users", {
      full_name: formData.full_name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim() || undefined,
      // Left blank, the server generates one and returns it below.
      password: formData.password || undefined,
      role: "company_hr",
      company_id: Number(formData.company_id),
      send_credentials_email: sendEmail,
    })
      .then((res) => {
        setShowForm(false);
        setFormData(blankForm);
        fetchHRUsers();
        // The password is only ever returned here -- just the hash is stored --
        // so it has to be shown now or it is lost.
        setCredentials({
          heading: "HR login created",
          email: res.email,
          full_name: res.full_name,
          password: res.temporary_password,
          emailed: !!res.credentials_email_queued,
          skippedReason: res.credentials_email_skipped_reason ?? null,
        });
      })
      .catch((err) => setFormError(err.message || "Failed to create the HR login."))
      .finally(() => setSaving(false));
  };

  const handleStatusChange = (h: HRUser) => {
    const next = h.status === "active" ? "suspended" : "active";
    if (next === "suspended" && !window.confirm(
      `Suspend ${h.full_name || h.email}?\n\nThey are signed out immediately and ` +
      "cannot log in until you reactivate the account.",
    )) return;

    setBusyId(h.id);
    api.patch(`/ops/users/${h.id}`, { account_status: next })
      .then(() => fetchHRUsers())
      .catch((err) => alert(err.message || "Failed to update status"))
      .finally(() => setBusyId(null));
  };

  const handleResetPassword = (h: HRUser) => {
    if (!window.confirm(
      `Reset the password for ${h.full_name || h.email}?\n\n` +
      "A new one-time password is issued and all their active sessions are signed out.",
    )) return;

    setBusyId(h.id);
    api.post<any>(`/ops/users/${h.id}/reset-password`)
      .then((res) => {
        fetchHRUsers();
        setCredentials({
          heading: "Password reset",
          email: res.email,
          full_name: h.full_name,
          password: res.temporary_password,
          emailed: false,
          skippedReason: "not_requested",
        });
      })
      .catch((err) => alert(err.message || "Failed to reset password"))
      .finally(() => setBusyId(null));
  };

  const handleDelete = (h: HRUser) => {
    if (!window.confirm(
      `Permanently delete the HR account for ${h.full_name || h.email} (${h.email})?\n\n` +
      "They lose access immediately and this cannot be undone. Suspend them " +
      "instead if you only want to block sign-in for now.",
    )) return;

    setBusyId(h.id);
    api.del(`/ops/users/${h.id}`)
      .then(() => fetchHRUsers())
      .catch((err) => alert(err.message || "Failed to delete HR account"))
      .finally(() => setBusyId(null));
  };

  const filtered = hrUsers.filter((h) => {
    const term = search.toLowerCase();
    const matchesSearch =
      (h.full_name || "").toLowerCase().includes(term) ||
      (h.company?.name || "").toLowerCase().includes(term) ||
      h.email.toLowerCase().includes(term);
    const matchesCompany = !companyFilter || String(h.company?.id) === companyFilter;
    const matchesStatus = !statusFilter || h.status === statusFilter;
    return matchesSearch && matchesCompany && matchesStatus;
  });

  // Only the HR users on this screen -- the audit log covers the whole portal.
  const hrEmails = new Set(hrUsers.map((h) => h.email.toLowerCase()));
  const hrLogs = logs.filter((l) => {
    if (!l.actor_email || !hrEmails.has(l.actor_email.toLowerCase())) return false;
    if (!logSearch) return true;
    const term = logSearch.toLowerCase();
    return (l.summary || "").toLowerCase().includes(term)
      || l.action.toLowerCase().includes(term)
      || l.actor_email.toLowerCase().includes(term);
  });

  const nameOf = (email: string) =>
    hrUsers.find((h) => h.email.toLowerCase() === email.toLowerCase())?.full_name || email;
  const companyOf = (email: string) =>
    hrUsers.find((h) => h.email.toLowerCase() === email.toLowerCase())?.company?.name || "—";

  const stats = [
    { label: "Total HRs", value: hrUsers.length, bg: "bg-blue-50 text-blue-700 border-blue-100" },
    { label: "Active", value: hrUsers.filter((h) => h.status === "active").length, bg: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    { label: "Temp Password", value: hrUsers.filter((h) => !h.password_set).length, bg: "bg-amber-50 text-amber-700 border-amber-100" },
    { label: "Suspended", value: hrUsers.filter((h) => h.status === "suspended").length, bg: "bg-rose-50 text-rose-700 border-rose-100" },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Company HR Portal Management</h1>
          <p className="text-sm text-muted-foreground">{hrUsers.length} HR accounts</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-accent hover:bg-accent/90" onClick={openForm}>
            <Plus className="mr-2 h-4 w-4" />Create HR Login
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <p className="text-xs font-medium opacity-70">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">HR Accounts</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="activity">Activity Logs</TabsTrigger>
        </TabsList>

        {/* HR ACCOUNTS */}
        <TabsContent value="accounts" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search by name, company, email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <select
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                >
                  <option value="">All Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-accent" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {hrUsers.length === 0
                    ? 'No HR accounts yet. Click "Create HR Login" to add one.'
                    : "No HR accounts match these filters."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="p-4 text-left font-semibold text-slate-600">HR User</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Company</th>
                        <th className="p-4 text-left font-semibold text-slate-600" title="Internships this HR created">Posted</th>
                        <th className="p-4 text-left font-semibold text-slate-600" title="Applications this HR acted on">Reviewed</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Phone</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Password</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Last Login</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Status</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((h) => (
                        <tr key={h.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                                {(h.full_name || h.email)[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{h.full_name || "—"}</p>
                                <p className="text-xs text-muted-foreground">{h.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{h.company?.name || "Unassigned"}</span>
                            </div>
                          </td>
                          <td className="p-4 font-semibold text-accent">{h.internships_posted}</td>
                          <td className="p-4 font-semibold text-slate-700">{h.applications_reviewed}</td>
                          <td className="p-4 text-slate-700">{h.phone || "—"}</td>
                          <td className="p-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${h.password_set ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"}`}>
                              {h.password_set ? "Set" : "Temporary"}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-muted-foreground">{fmtDate(h.last_login_at)}</td>
                          <td className="p-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[h.status] || "bg-slate-100 text-slate-600"}`}>
                              {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              {busyId === h.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                              ) : (
                                <>
                                  <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setViewHR(h)} title="View">
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button className="rounded-md p-1.5 text-amber-400 hover:bg-amber-50" onClick={() => handleResetPassword(h)} title="Reset Password">
                                    <Lock className="h-4 w-4" />
                                  </button>
                                  {h.status === "active" ? (
                                    <button className="rounded-md p-1.5 text-rose-400 hover:bg-rose-50" onClick={() => handleStatusChange(h)} title="Suspend">
                                      <XCircle className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <button className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-50" onClick={() => handleStatusChange(h)} title="Activate">
                                      <CheckCircle2 className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => handleDelete(h)} title="Delete">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERMISSIONS */}
        <TabsContent value="permissions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company HR Permissions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Access is granted by the <span className="font-medium">Company HR</span> role, so
                every HR account below shares this set. Each one only ever sees its own
                company's data. Edit the role under Admin → Roles &amp; Permissions.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.keys(rolePermissions).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No permissions are granted to the Company HR role yet.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(rolePermissions).map(([resource, actions]) => (
                    <div key={resource} className="rounded-xl border border-border p-4">
                      <p className="mb-2 text-sm font-semibold text-slate-800">
                        {RESOURCE_LABELS[resource] || resource}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {actions.map((a) => (
                          <span key={a} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVITY LOGS */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">HR Activity Logs</CardTitle>
              <div className="flex gap-2">
                <Input placeholder="Search logs..." className="h-8 w-48 text-sm" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} />
                <select
                  className="h-8 rounded-lg border border-border bg-white px-2 text-sm"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                >
                  <option value="">All Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {hrLogs.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No HR activity recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="p-4 text-left font-semibold text-slate-600">HR User</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Company</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Action</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hrLogs
                        .filter((l) => !companyFilter || companyOf(l.actor_email!) === companies.find((c) => String(c.id) === companyFilter)?.name)
                        .map((l) => (
                          <tr key={l.id} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="p-4 font-medium">{nameOf(l.actor_email!)}</td>
                            <td className="p-4 text-sm text-muted-foreground">{companyOf(l.actor_email!)}</td>
                            <td className="p-4 text-sm">
                              {l.action.replace(/_/g, " ")}
                              {l.summary ? ` — ${l.summary}` : ""}
                            </td>
                            <td className="p-4 text-xs text-muted-foreground">{fmtDate(l.created_at)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create HR Login Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Create HR Login</CardTitle>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateHR} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Full Name *</label>
                    <Input
                      placeholder="HR Manager Name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Work Email *</label>
                    <Input
                      type="email"
                      placeholder="hr@company.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      placeholder="+91-XXXXXXXXXX"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Assign Company *</label>
                    <select
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                      value={formData.company_id}
                      onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                      disabled={companiesLoading}
                      required
                    >
                      <option value="">
                        {companiesLoading
                          ? "Loading companies..."
                          : companies.length === 0
                            ? "No companies found — add one first"
                            : "Select Company"}
                      </option>
                      {companies.map((c) => (
                        <option key={c.id} value={String(c.id)}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Temporary Password</label>
                  <Input
                    placeholder="Leave blank to generate one automatically"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown once after creation. The HR user must change it on first sign-in.
                  </p>
                </div>

                <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Email the credentials to the HR user</span>
                    <span className="block text-xs text-muted-foreground">
                      The password is also shown on screen either way.
                    </span>
                  </span>
                </label>

                <div className="rounded-lg border border-border bg-slate-50 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Shield className="h-4 w-4 text-accent" />Permissions
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This account gets the Company HR role and is scoped to the company selected
                    above, so it can only see that company's data. Permissions are set per role
                    under Admin → Roles &amp; Permissions, not per user.
                  </p>
                </div>

                {formError && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
                )}

                <div className="flex gap-3">
                  <Button type="submit" disabled={saving} className="bg-accent hover:bg-accent/90">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {sendEmail ? "Create & Send Credentials" : "Create HR Login"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* One-time credentials */}
      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />{credentials.heading}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-mono font-medium break-all">{credentials.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Temporary password</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-medium">{credentials.password}</p>
                    <button
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy"
                      onClick={() => navigator.clipboard?.writeText(
                        `Email: ${credentials.email}\nPassword: ${credentials.password}`,
                      )}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {credentials.emailed ? (
                <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                  Credentials were emailed to {credentials.email}.
                </p>
              ) : credentials.skippedReason === "smtp_not_configured" ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Email could not be sent because SMTP is not configured on the server.
                  Copy the password above and share it securely.
                </p>
              ) : null}

              <p className="text-xs text-muted-foreground">
                This password is shown only once — only its hash is stored, so it cannot be
                retrieved later. Use Reset Password if it is lost.
              </p>

              <Button className="bg-accent hover:bg-accent/90" onClick={() => setCredentials(null)}>
                Done
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View HR Modal */}
      {viewHR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-600">
                  {(viewHR.full_name || viewHR.email)[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="font-bold">{viewHR.full_name || viewHR.email}</h2>
                  <p className="text-sm text-muted-foreground">{viewHR.company?.name || "Unassigned"}</p>
                </div>
              </div>
              <button onClick={() => setViewHR(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Email", value: viewHR.email },
                  { label: "Phone", value: viewHR.phone || "—" },
                  { label: "Internships Posted", value: viewHR.internships_posted },
                  { label: "Applications Reviewed", value: viewHR.applications_reviewed },
                  { label: "Status", value: viewHR.status },
                  { label: "Password", value: viewHR.password_set ? "Set by user" : "Temporary" },
                  { label: "Created", value: fmtDate(viewHR.created_at) },
                  { label: "Last Login", value: fmtDate(viewHR.last_login_at) },
                ].map((d) => (
                  <div key={d.label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className="font-medium break-all">{d.value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Permissions (Company HR role)</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(rolePermissions).length === 0 ? (
                    <span className="text-xs text-muted-foreground">None granted.</span>
                  ) : (
                    Object.entries(rolePermissions).map(([resource, actions]) => (
                      <span key={resource} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                        {RESOURCE_LABELS[resource] || resource}: {actions.join(", ")}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setViewHR(null); handleResetPassword(viewHR); }}>
                  <Lock className="mr-2 h-4 w-4" />Reset Password
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setViewHR(null); handleStatusChange(viewHR); }}>
                  {viewHR.status === "active" ? (
                    <><XCircle className="mr-2 h-4 w-4" />Suspend</>
                  ) : (
                    <><CheckCircle2 className="mr-2 h-4 w-4" />Activate</>
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setLogSearch(viewHR.email); setViewHR(null); }}>
                  <Activity className="mr-2 h-4 w-4" />Activity Log
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CompanyHRManagement;
