import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Plus, Eye, Download, Upload,
  Users, Mail, Phone, CheckCircle2, XCircle, Loader2, Trash2,
} from "lucide-react";
import { api } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-rose-100 text-rose-700",
  pending: "bg-amber-100 text-amber-700",
};

interface CoordinatorUser {
  id: number;
  email: string;
  role: string;
  status: string;
  full_name: string | null;
  phone: string | null;
  /** The server nests this; reading a flat college_id always gave undefined,
   *  which is why every row used to say "Unassigned". */
  college: { id: number | null; name: string | null } | null;
  created_at: string;
  last_login_at: string | null;
}

const CoordinatorManagement = () => {
  const [coordinators, setCoordinators] = useState<CoordinatorUser[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [viewCoord, setViewCoord] = useState<any | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    college_id: "",
    role: "college_coordinator",
  });
  const [saving, setSaving] = useState(false);

  const blankForm = {
    full_name: "",
    email: "",
    phone: "",
    password: "",
    college_id: "",
    role: "college_coordinator",
  };

  /** Which row has a request in flight, so its buttons cannot be double-fired. */
  const [busyId, setBusyId] = useState<number | null>(null);

  // Upload state
  const [selectedCollegeId, setSelectedCollegeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchCoordinators = () => {
    setLoading(true);
    api.get<any>("/ops/users?role=college_coordinator")
      .then((res) => {
        setCoordinators(res.items || res || []);
        setLoading(false);
      })
      .catch(() => {
        setCoordinators([]);
        setLoading(false);
      });
  };

  const fetchColleges = () => {
    api.get<any>("/ops/colleges?page=1&page_size=100")
      .then((res) => setColleges(res.items || []))
      .catch(() => setColleges([]));
  };

  useEffect(() => {
    fetchCoordinators();
    fetchColleges();
  }, []);

  const handleCreateCoordinator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim() || !formData.email.trim() || !formData.college_id) {
      return alert("Name, email, and college selection are required");
    }
    setSaving(true);
    api.post<any>("/ops/users", {
      full_name: formData.full_name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim() || undefined,
      // Left blank, the server generates one and returns it below.
      password: formData.password || undefined,
      role: formData.role,
      college_id: Number(formData.college_id),
    })
      .then((res) => {
        setShowForm(false);
        setFormData(blankForm);
        fetchCoordinators();
        // The password is only ever returned here -- just the hash is stored --
        // so it has to be shown now or it is lost.
        alert(
          `Coordinator created.\n\n` +
          `Name:     ${res.full_name}\n` +
          `Email:    ${res.email}\n` +
          `Password: ${res.temporary_password}\n\n` +
          (res.password_was_generated
            ? "This password was generated because you left the field blank. "
            : "") +
          "Share it securely — it cannot be retrieved again, and they must " +
          "change it after signing in.",
        );
      })
      .catch((err) => alert(err.message || "Failed to create coordinator"))
      .finally(() => setSaving(false));
  };

  const handleStatusChange = (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    setBusyId(id);
    // `account_status` is the field the server reads. Sending `status` was
    // silently ignored, so this button returned 200 and changed nothing.
    api.patch(`/ops/users/${id}`, { account_status: newStatus })
      .then(() => fetchCoordinators())
      .catch((err) => alert(err.message || "Failed to update status"))
      .finally(() => setBusyId(null));
  };

  const handleDelete = (c: CoordinatorUser) => {
    const who = c.full_name || c.email;
    if (!window.confirm(
      `Permanently delete the coordinator account for ${who} (${c.email})?\n\n` +
      "They lose access immediately and this cannot be undone. Suspend them " +
      "instead if you only want to block sign-in for now.",
    )) return;

    setBusyId(c.id);
    // The server refuses to delete your own account or the last super admin,
    // and its message says which -- so surface it as-is.
    api.del(`/ops/users/${c.id}`)
      .then(() => fetchCoordinators())
      .catch((err) => alert(err.message || "Failed to delete coordinator"))
      .finally(() => setBusyId(null));
  };

  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedCollegeId) return alert("Please select a college and CSV file");
    setUploading(true);

    const form = new FormData();
    form.append("file", file);
    form.append("college_id", selectedCollegeId);

    try {
      const res = await fetch("/api/ops/students/bulk-upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json();
      setUploading(false);
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      alert(`Success! ${data.created_count || 0} students imported.`);
      setFile(null);
    } catch (err: any) {
      setUploading(false);
      alert(err.message || "Failed to upload file");
    }
  };

  const filtered = coordinators.filter((c) => {
    const term = search.toLowerCase();
    return (
      c.email.toLowerCase().includes(term) ||
      (c.full_name || "").toLowerCase().includes(term) ||
      (c.phone || "").includes(search)
    );
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">College Coordinator Management</h1>
          <p className="text-sm text-muted-foreground">{coordinators.length} coordinators registered in database</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-accent hover:bg-accent/90" onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Register Coordinator
          </Button>
        </div>
      </div>

      <Tabs defaultValue="coordinators">
        <TabsList>
          <TabsTrigger value="coordinators">Coordinators</TabsTrigger>
          <TabsTrigger value="uploads">Student Bulk Upload</TabsTrigger>
        </TabsList>

        {/* COORDINATORS TABLE */}
        <TabsContent value="coordinators" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email or mobile..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                </div>
              ) : coordinators.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No college coordinators found in database.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="p-4 text-left font-semibold text-slate-600">Coordinator</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Mobile</th>
                        <th className="p-4 text-left font-semibold text-slate-600">College</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Last Login</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Status</th>
                        <th className="p-4 text-left font-semibold text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                                {(c.full_name || c.email)[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{c.full_name || "No name"}</p>
                                <p className="text-xs text-muted-foreground">{c.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-sm">
                            {c.phone ? (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground" />{c.phone}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-4 font-medium">{c.college?.name || "Unassigned"}</td>
                          <td className="p-4 text-xs text-muted-foreground">{c.last_login_at ? new Date(c.last_login_at).toLocaleString() : "Never"}</td>
                          <td className="p-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[c.status] || "bg-slate-100"}`}>
                              {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              <button
                                className={`rounded-md p-1.5 disabled:opacity-40 ${c.status === "active" ? "text-rose-500 hover:bg-rose-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                                title={c.status === "active" ? "Suspend Coordinator" : "Activate Coordinator"}
                                disabled={busyId === c.id}
                                onClick={() => handleStatusChange(c.id, c.status)}
                              >
                                {busyId === c.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : c.status === "active"
                                    ? <XCircle className="h-4 w-4" />
                                    : <CheckCircle2 className="h-4 w-4" />}
                              </button>
                              <button
                                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                title="Delete Coordinator"
                                disabled={busyId === c.id}
                                onClick={() => handleDelete(c)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
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

        {/* STUDENT UPLOADS */}
        <TabsContent value="uploads" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Bulk Student CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleCsvUpload} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Select Target College *</label>
                  <select
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={selectedCollegeId}
                    onChange={(e) => setSelectedCollegeId(e.target.value)}
                    required
                  >
                    <option value="">-- Select College --</option>
                    {colleges.map((col) => (
                      <option key={col.id} value={col.id}>{col.name}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
                  <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="mb-1 font-medium text-slate-600">Select CSV file with student records</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="mt-2 text-xs"
                    required
                  />
                </div>
                <Button type="submit" disabled={uploading} className="bg-accent hover:bg-accent/90">
                  {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Upload & Import Students
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Register Coordinator Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Register College Coordinator</CardTitle>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCoordinator} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Full Name *</label>
                  <Input
                    placeholder="e.g. Dr. R. Meenakshi"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Email Address *</label>
                  <Input
                    type="email"
                    placeholder="coordinator@college.edu.in"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Mobile Number</label>
                  <Input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Temporary Password</label>
                  <Input
                    type="password"
                    placeholder="Leave blank to generate one"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum 8 characters with a letter and a number. Shown once
                    after saving, so you can pass it on.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Assign College *</label>
                  <select
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={formData.college_id}
                    onChange={(e) => setFormData({ ...formData, college_id: e.target.value })}
                    required
                  >
                    <option value="">-- Select College --</option>
                    {colleges.map((col) => (
                      <option key={col.id} value={col.id}>{col.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={saving} className="bg-accent hover:bg-accent/90">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Coordinator
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CoordinatorManagement;
