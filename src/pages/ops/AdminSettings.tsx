import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Shield, Users, Database, Settings, Loader2,
  CheckCircle2, XCircle,
} from "lucide-react";
import { api } from "@/lib/api";

const ROLE_LABELS: Record<string, { label: string; style: string }> = {
  super_admin: { label: "Super Admin", style: "bg-rose-100 text-rose-700" },
  admin: { label: "Admin", style: "bg-rose-100 text-rose-700" },
  ops_manager: { label: "Ops Manager", style: "bg-purple-100 text-purple-700" },
  ops_executive: { label: "Ops Executive", style: "bg-accent/10 text-accent" },
  company_hr: { label: "Company HR", style: "bg-blue-100 text-blue-700" },
  college_coordinator: { label: "College Coordinator", style: "bg-indigo-100 text-indigo-700" },
  mentor: { label: "Mentor", style: "bg-amber-100 text-amber-700" },
  student: { label: "Student", style: "bg-emerald-100 text-emerald-700" },
};

const roleOf = (role: string) =>
  ROLE_LABELS[role] || { label: role.replace(/_/g, " "), style: "bg-slate-100 text-slate-700" };

/** Roles the server will accept from this screen (PROVISIONABLE_ROLES). */
const PROVISIONABLE = [
  "ops_manager", "ops_executive", "company_hr", "college_coordinator", "mentor", "super_admin",
];

/** Master-data categories the server knows about, with display labels. */
const MASTER_CATEGORIES = [
  { key: "skill", label: "Skills" },
  { key: "department", label: "Departments" },
  { key: "industry", label: "Industries" },
  { key: "internship_category", label: "Internship Categories" },
  { key: "university", label: "Universities" },
  { key: "city", label: "Cities" },
  { key: "state", label: "States" },
  { key: "country", label: "Countries" },
];

const SETTING_CATEGORY_LABELS: Record<string, string> = {
  email: "Email / SMTP",
  sms: "SMS Gateway",
  whatsapp: "WhatsApp API",
  branding: "Branding",
  legal: "Legal",
  notifications: "Notifications",
  certificate: "Certificates",
};

interface PortalUser {
  id: number;
  email: string;
  role: string;
  status: string;
  full_name: string | null;
  company: { id: number | null; name: string | null } | null;
  college: { id: number | null; name: string | null } | null;
  last_login_at: string | null;
}

interface MasterItem { id: number; category: string; name: string; code: string | null }

interface SettingField {
  key: string;
  label: string;
  secret: boolean;
  has_value: boolean;
  value: string | null;
}

interface AuditEntry {
  id: number;
  action: string;
  entity_type: string | null;
  summary: string | null;
  actor_email: string | null;
  actor_role: string | null;
  ip_address: string | null;
  created_at: string | null;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

/** Six sidebar links land on this one page, so the route decides which tab
 *  opens. Without this, "Audit Logs" dropped you on the Users tab. */
const TAB_FOR_PATH: Record<string, string> = {
  "/ops/admin/users": "users",
  "/ops/admin/roles": "roles",
  "/ops/admin/master-data": "master",
  "/ops/admin/audit": "audit",
  "/ops/admin/settings": "settings",
};

const AdminSettings = () => {
  const location = useLocation();
  const routeTab = TAB_FOR_PATH[location.pathname] || "users";
  const [tab, setTab] = useState(routeTab);

  // Following a sidebar link while already on this page changes only the path,
  // so the tab has to follow it.
  useEffect(() => { setTab(routeTab); }, [routeTab]);

  // ---- Users ----
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", role: "", password: "" });
  const [savingUser, setSavingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  // ---- Roles ----
  const [matrix, setMatrix] = useState<Record<string, Record<string, string[]>>>({});
  const [resources, setResources] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [matrixRole, setMatrixRole] = useState("company_hr");

  // ---- Master data ----
  const [masterCategory, setMasterCategory] = useState("skill");
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);
  const [newItem, setNewItem] = useState("");

  // ---- Audit ----
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [logSearch, setLogSearch] = useState("");

  // ---- Settings ----
  const [settings, setSettings] = useState<Record<string, SettingField[]>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingCat, setSavingCat] = useState("");
  const [savedCat, setSavedCat] = useState("");

  const fetchUsers = () => {
    setUsersLoading(true);
    api.get<{ items?: PortalUser[] }>("/ops/users?page=1&page_size=200")
      .then((res) => setUsers(res.items || []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  };

  const fetchMaster = (category: string) => {
    setMasterLoading(true);
    api.get<MasterItem[]>(`/ops/master/${category}`)
      .then((res) => setMasterItems(Array.isArray(res) ? res : []))
      .catch(() => setMasterItems([]))
      .finally(() => setMasterLoading(false));
  };

  useEffect(() => {
    fetchUsers();
    api.get<any>("/ops/permissions")
      .then((res) => {
        setMatrix(res.matrix || {});
        setResources(res.resources || []);
        setActions(res.actions || []);
      })
      .catch(() => setMatrix({}));
    api.get<{ items?: AuditEntry[] }>("/ops/audit-logs?page=1&page_size=200")
      .then((res) => setLogs(res.items || []))
      .catch(() => setLogs([]));
    api.get<{ categories?: Record<string, SettingField[]> }>("/ops/settings")
      .then((res) => setSettings(res.categories || {}))
      .catch(() => setSettings({}));
  }, []);

  useEffect(() => { fetchMaster(masterCategory); }, [masterCategory]);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.full_name.trim() || !newUser.email.trim() || !newUser.role) {
      setUserError("Name, email and role are all required.");
      return;
    }
    // A company_hr or college_coordinator needs its scope, which this screen has
    // no picker for -- send them to the dedicated screen instead of failing.
    if (newUser.role === "company_hr" || newUser.role === "college_coordinator") {
      setUserError(
        newUser.role === "company_hr"
          ? "Company HR accounts must be assigned a company — create them on the Company HR screen."
          : "Coordinators must be assigned a college — create them on the Coordinators screen.",
      );
      return;
    }
    setUserError("");
    setSavingUser(true);
    api.post<any>("/ops/users", {
      full_name: newUser.full_name.trim(),
      email: newUser.email.trim(),
      role: newUser.role,
      password: newUser.password || undefined,
    })
      .then((res) => {
        setShowAddUser(false);
        setNewUser({ full_name: "", email: "", role: "", password: "" });
        fetchUsers();
        // Returned once only -- the server stores just the hash.
        alert(
          `User created.\n\nEmail: ${res.email}\nPassword: ${res.temporary_password}\n\n` +
          "Share it securely. It cannot be retrieved again.",
        );
      })
      .catch((err) => setUserError(err.message || "Failed to create the user."))
      .finally(() => setSavingUser(false));
  };

  const toggleUserStatus = (u: PortalUser) => {
    const next = u.status === "active" ? "suspended" : "active";
    setBusyUserId(u.id);
    api.patch(`/ops/users/${u.id}`, { account_status: next })
      .then(() => fetchUsers())
      .catch((err) => alert(err.message || "Failed to update status"))
      .finally(() => setBusyUserId(null));
  };

  const deleteUser = (u: PortalUser) => {
    if (!window.confirm(
      `Permanently delete ${u.full_name || u.email}?\n\nThis cannot be undone.`,
    )) return;
    setBusyUserId(u.id);
    api.del(`/ops/users/${u.id}`)
      .then(() => fetchUsers())
      .catch((err) => alert(err.message || "Failed to delete the user"))
      .finally(() => setBusyUserId(null));
  };

  const addMasterItem = () => {
    if (!newItem.trim()) return;
    api.post("/ops/master", { category: masterCategory, name: newItem.trim() })
      .then(() => {
        setNewItem("");
        fetchMaster(masterCategory);
      })
      .catch((err) => alert(err.message || "Could not add that item"));
  };

  const removeMasterItem = (item: MasterItem) => {
    api.del(`/ops/master/${item.id}`)
      .then(() => fetchMaster(masterCategory))
      .catch((err) => alert(err.message || "Could not remove that item"));
  };

  const saveSettings = (category: string) => {
    const fields = settings[category] || [];
    // Only send what was actually edited; an untouched secret keeps its mask and
    // the server ignores it.
    const changed = fields.filter((f) => edits[`${category}.${f.key}`] !== undefined);
    if (changed.length === 0) return;

    setSavingCat(category);
    Promise.all(changed.map((f) =>
      api.put("/ops/settings", {
        category, key: f.key, value: edits[`${category}.${f.key}`],
      }),
    ))
      .then(() => api.get<{ categories?: Record<string, SettingField[]> }>("/ops/settings"))
      .then((res) => {
        setSettings(res.categories || {});
        setEdits((prev) => {
          const next = { ...prev };
          changed.forEach((f) => delete next[`${category}.${f.key}`]);
          return next;
        });
        setSavedCat(category);
        setTimeout(() => setSavedCat(""), 2500);
      })
      .catch((err: Error) => alert(err.message || "Could not save those settings"))
      .finally(() => setSavingCat(""));
  };

  const filteredLogs = logs.filter((l) => {
    if (!logSearch) return true;
    const t = logSearch.toLowerCase();
    return (l.summary || "").toLowerCase().includes(t)
      || l.action.toLowerCase().includes(t)
      || (l.actor_email || "").toLowerCase().includes(t)
      || (l.entity_type || "").toLowerCase().includes(t);
  });

  const roleRows = Object.keys(matrix).length
    ? Object.keys(matrix)
    : ["ops_manager", "ops_executive", "company_hr", "college_coordinator", "mentor"];

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Administration</h1>
        <p className="text-sm text-muted-foreground">User management, roles, master data, and audit logs</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="users"><Users className="mr-2 h-4 w-4" />Users</TabsTrigger>
          <TabsTrigger value="roles"><Shield className="mr-2 h-4 w-4" />Roles &amp; Permissions</TabsTrigger>
          <TabsTrigger value="master"><Database className="mr-2 h-4 w-4" />Master Data</TabsTrigger>
          <TabsTrigger value="audit"><Settings className="mr-2 h-4 w-4" />Audit Logs</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="mr-2 h-4 w-4" />System Settings</TabsTrigger>
        </TabsList>

        {/* USERS */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">Portal Users ({users.length})</h3>
            <Button size="sm" className="bg-accent hover:bg-accent/90" onClick={() => { setUserError(""); setShowAddUser(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add User
            </Button>
          </div>

          {showAddUser && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Add New User</CardTitle>
                <button onClick={() => setShowAddUser(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateUser} className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Full Name *</label>
                    <Input
                      placeholder="Full name"
                      value={newUser.full_name}
                      onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Email *</label>
                    <Input
                      type="email"
                      placeholder="user@outofsyllabuss.org"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Role *</label>
                    <select
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      required
                    >
                      <option value="">Select Role</option>
                      {PROVISIONABLE.map((r) => (
                        <option key={r} value={r}>{roleOf(r).label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Temporary Password</label>
                    <Input
                      placeholder="Leave blank to generate one"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                  </div>
                  {userError && (
                    <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{userError}</p>
                  )}
                  <div className="flex gap-3 sm:col-span-2">
                    <Button type="submit" disabled={savingUser} className="bg-accent hover:bg-accent/90">
                      {savingUser && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create User
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowAddUser(false)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              ) : users.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No portal users found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="p-4 text-left font-semibold text-slate-600">User</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Role</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Scope</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Status</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Last Login</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                                {(u.full_name || u.email)[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium">{u.full_name || "—"}</p>
                                <p className="text-xs text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${roleOf(u.role).style}`}>
                              {roleOf(u.role).label}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-muted-foreground">
                            {u.company?.name || u.college?.name || "—"}
                          </td>
                          <td className="p-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              {u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-muted-foreground">{fmtDate(u.last_login_at)}</td>
                          <td className="p-4">
                            <div className="flex gap-1">
                              {busyUserId === u.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                              ) : (
                                <>
                                  <button
                                    className={`rounded-md p-1.5 ${u.status === "active" ? "text-rose-400 hover:bg-rose-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                                    title={u.status === "active" ? "Suspend" : "Activate"}
                                    onClick={() => toggleUserStatus(u)}
                                  >
                                    {u.status === "active" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                  </button>
                                  <button
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                                    title="Delete"
                                    onClick={() => deleteUser(u)}
                                  >
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

        {/* ROLES */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Role Permissions</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Live from the server. Super admin bypasses this table and always has full access.
                </p>
              </div>
              <select
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={matrixRole}
                onChange={(e) => setMatrixRole(e.target.value)}
              >
                {roleRows.map((r) => <option key={r} value={r}>{roleOf(r).label}</option>)}
              </select>
            </CardHeader>
            <CardContent className="p-0">
              {resources.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Could not load the permission matrix.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="p-4 text-left font-semibold text-slate-600">Resource</th>
                        {actions.map((a) => (
                          <th key={a} className="p-4 text-center font-semibold capitalize text-slate-600">{a}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resources.map((res) => {
                        const allowed = matrix[matrixRole]?.[res] || [];
                        return (
                          <tr key={res} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="p-4 font-medium capitalize">{res.replace(/_/g, " ")}</td>
                            {actions.map((a) => (
                              <td key={a} className="p-4 text-center">
                                {allowed.includes(a) ? (
                                  <span className="inline-block h-5 w-5 rounded-full bg-emerald-100 text-center text-xs leading-5 text-emerald-700">✓</span>
                                ) : (
                                  <span className="inline-block h-5 w-5 rounded-full bg-slate-100 text-center text-xs leading-5 text-slate-400">✕</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MASTER DATA */}
        <TabsContent value="master" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Master Data</CardTitle>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  value={masterCategory}
                  onChange={(e) => setMasterCategory(e.target.value)}
                >
                  {MASTER_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <Input
                  placeholder="Add new value..."
                  className="h-10 w-48 text-sm"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMasterItem(); } }}
                />
                <Button size="sm" className="h-10 bg-accent hover:bg-accent/90" onClick={addMasterItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {masterLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              ) : masterItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing configured under{" "}
                  {MASTER_CATEGORIES.find((c) => c.key === masterCategory)?.label} yet.
                  Add the first value above.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {masterItems.map((item) => (
                    <span key={item.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                      {item.name}
                      <button
                        className="text-rose-400 hover:text-rose-600"
                        title="Remove"
                        onClick={() => removeMasterItem(item)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUDIT LOGS */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Audit Logs</CardTitle>
              <Input
                placeholder="Search logs..."
                className="h-8 w-56 text-sm"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
              />
            </CardHeader>
            <CardContent className="p-0">
              {filteredLogs.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  {logs.length === 0 ? "No audit entries recorded yet." : "No entries match that search."}
                </p>
              ) : (
                <div className="max-h-[600px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b bg-slate-50">
                      <tr>
                        <th className="p-4 text-left font-semibold text-slate-600">User</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Action</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Entity</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Time</th>
                        <th className="p-4 text-left font-semibold text-slate-600">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="p-4">
                            <p className="font-medium">{log.actor_email || "system"}</p>
                            {log.actor_role && (
                              <p className="text-xs text-muted-foreground">{roleOf(log.actor_role).label}</p>
                            )}
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {log.action.replace(/_/g, " ")}
                            {log.summary ? ` — ${log.summary}` : ""}
                          </td>
                          <td className="p-4">
                            {log.entity_type && (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize">
                                {log.entity_type.replace(/_/g, " ")}
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-xs text-muted-foreground">{fmtDate(log.created_at)}</td>
                          <td className="p-4 font-mono text-xs text-muted-foreground">{log.ip_address || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SYSTEM SETTINGS */}
        <TabsContent value="settings" className="mt-4">
          {Object.keys(settings).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Could not load system settings.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(settings).map(([category, fields]) => (
                <Card key={category}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {SETTING_CATEGORY_LABELS[category] || category}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {fields.map((f) => {
                      const editKey = `${category}.${f.key}`;
                      const current = edits[editKey] ?? f.value ?? "";
                      return (
                        <div key={f.key} className="space-y-1">
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            {f.label}
                            {f.secret && f.has_value && (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                                configured
                              </span>
                            )}
                          </label>
                          <Input
                            className="h-8 text-sm"
                            placeholder={f.secret ? "Leave unchanged to keep the current value" : f.label}
                            value={current}
                            onChange={(e) => setEdits({ ...edits, [editKey]: e.target.value })}
                          />
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-8 bg-accent text-xs hover:bg-accent/90"
                        disabled={savingCat === category}
                        onClick={() => saveSettings(category)}
                      >
                        {savingCat === category && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                        Save
                      </Button>
                      {savedCat === category && (
                        <span className="text-xs text-emerald-600">Saved</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSettings;
