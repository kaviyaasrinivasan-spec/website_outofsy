import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Download, Edit, Eye, CheckCircle2,
  MapPin, Phone, Mail, Users, FileText, Loader2,
  Archive, ArchiveRestore, Trash2,
} from "lucide-react";
import { api } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  suspended: "bg-rose-100 text-rose-700",
};

interface CollegeItem {
  id: number;
  name: string;
  university: string | null;
  college_code: string | null;
  location: string | null;
  website: string | null;
  departments: string | null;
  student_count: number | null;
  placement_officer: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  partnership_status: string;
  is_archived?: boolean;
  created_at: string;
}

const CollegeManagement = () => {
  const [colleges, setColleges] = useState<CollegeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewCollege, setViewCollege] = useState<any | null>(null);
  /** Which row has a request in flight, so its buttons cannot be double-fired. */
  const [busyId, setBusyId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    university: "",
    college_code: "",
    location: "",
    website: "",
    placement_officer: "",
    contact_person: "",
    contact_email: "",
    contact_phone: "",
    departments: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchColleges = () => {
    setLoading(true);
    let url = `/ops/colleges?page=1&page_size=50`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (statusFilter !== "all") url += `&partnership_status=${statusFilter}`;

    api.get<any>(url)
      .then((res) => {
        setColleges(res.items || []);
        setTotal(res.total || 0);
        setLoading(false);
      })
      .catch(() => {
        setColleges([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchColleges();
  }, [search, statusFilter]);

  const handleCreateCollege = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return alert("College name is required");
    setSaving(true);
    api.post("/ops/colleges", formData)
      .then(() => {
        setSaving(false);
        setShowForm(false);
        setFormData({
          name: "",
          university: "",
          college_code: "",
          location: "",
          website: "",
          placement_officer: "",
          contact_person: "",
          contact_email: "",
          contact_phone: "",
          departments: "",
        });
        fetchColleges();
      })
      .catch((err) => {
        setSaving(false);
        alert(err.message || "Failed to register college");
      });
  };

  const handleSetStatus = (id: number, status: string) => {
    setBusyId(id);
    api.post(`/ops/colleges/${id}/status?partnership_status=${status}`)
      .then(() => fetchColleges())
      .catch((err) => alert(err.message || "Failed to update college status"))
      .finally(() => setBusyId(null));
  };

  const handleViewCollege = (id: number) => {
    setBusyId(id);
    api.get<any>(`/ops/colleges/${id}`)
      .then((res) => setViewCollege(res))
      .catch((err) => alert(err.message || "Failed to load college details"))
      .finally(() => setBusyId(null));
  };

  const handleArchive = (c: CollegeItem) => {
    const archiving = !c.is_archived;
    if (archiving && !window.confirm(
      `Archive "${c.name}"?\n\nIt will be hidden from this list. Nothing is ` +
      "deleted — its coordinators, students and documents are kept, and you can " +
      "restore it from the Archived filter.",
    )) return;

    setBusyId(c.id);
    api.post(`/ops/colleges/${c.id}/archive?archived=${archiving}`)
      .then(() => fetchColleges())
      .catch((err) => alert(err.message || "Failed to archive college"))
      .finally(() => setBusyId(null));
  };

  const handleDelete = (c: CollegeItem) => {
    if (!window.confirm(
      `Permanently delete "${c.name}"?\n\nThis cannot be undone. Archive it ` +
      "instead if you only want it out of the list.",
    )) return;

    setBusyId(c.id);
    api.del(`/ops/colleges/${c.id}`)
      // The server refuses when coordinator accounts are attached, and its
      // message explains what to do -- so surface it as-is.
      .then(() => fetchColleges())
      .catch((err) => alert(err.message || "Failed to delete college"))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">College Management</h1>
          <p className="text-sm text-muted-foreground">{total} colleges registered in database</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-accent hover:bg-accent/90" onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add College
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search colleges..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">All Partnership Status</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              {/* A view, not a partnership status: the only option that shows
                  archived colleges, which every other one hides. */}
              <option value="archived">Archived</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : colleges.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No colleges found in database.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="p-4 text-left font-semibold text-slate-600">College</th>
                    <th className="p-4 text-left font-semibold text-slate-600">University</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Location</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Placement Officer</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Status</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {colleges.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                            {c.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.college_code || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm">{c.university || "—"}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />{c.location || "N/A"}
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-medium">{c.placement_officer || c.contact_person || "—"}</p>
                        <p className="text-xs text-muted-foreground">{c.contact_email || "—"}</p>
                      </td>
                      <td className="p-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[c.partnership_status] || "bg-slate-100"}`}>
                          {c.partnership_status.charAt(0).toUpperCase() + c.partnership_status.slice(1)}
                        </span>
                        {c.is_archived && (
                          <span className="ml-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <button
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                            title="View College"
                            disabled={busyId === c.id}
                            onClick={() => handleViewCollege(c.id)}
                          >
                            {busyId === c.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Eye className="h-4 w-4" />}
                          </button>
                          {c.partnership_status === "pending" && !c.is_archived && (
                            <button
                              className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-50 disabled:opacity-40"
                              title="Approve College"
                              disabled={busyId === c.id}
                              onClick={() => handleSetStatus(c.id, "approved")}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                            title={c.is_archived ? "Restore College" : "Archive College"}
                            disabled={busyId === c.id}
                            onClick={() => handleArchive(c)}
                          >
                            {c.is_archived
                              ? <ArchiveRestore className="h-4 w-4" />
                              : <Archive className="h-4 w-4" />}
                          </button>
                          <button
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                            title="Delete College"
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

      {/* Add College Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Register College</CardTitle>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCollege} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">College Name *</label>
                    <Input
                      placeholder="e.g., Anna University"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">University</label>
                    <Input
                      placeholder="e.g., Anna University"
                      value={formData.university}
                      onChange={(e) => setFormData({ ...formData, university: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">College Code</label>
                    <Input
                      placeholder="e.g., AU001"
                      value={formData.college_code}
                      onChange={(e) => setFormData({ ...formData, college_code: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Location</label>
                    <Input
                      placeholder="City, State"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Website</label>
                    <Input
                      placeholder="https://college.edu.in"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Placement Officer</label>
                    <Input
                      placeholder="Dr. Full Name"
                      value={formData.placement_officer}
                      onChange={(e) => setFormData({ ...formData, placement_officer: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Contact Email</label>
                    <Input
                      type="email"
                      placeholder="placement@college.edu.in"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      placeholder="+91-XXXXXXXXXX"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={saving} className="bg-accent hover:bg-accent/90">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Register College
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View College Modal */}
      {viewCollege && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">{viewCollege.name}</h2>
                <p className="text-sm text-muted-foreground">{viewCollege.university || "University"} · {viewCollege.college_code || "N/A"}</p>
              </div>
              <button onClick={() => setViewCollege(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <h4 className="mb-3 text-sm font-semibold">Details</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-accent" />Placement Officer: {viewCollege.placement_officer || "N/A"}</div>
                  <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-accent" />Email: {viewCollege.contact_email || "N/A"}</div>
                  <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-accent" />Phone: {viewCollege.contact_phone || "N/A"}</div>
                  <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-accent" />Location: {viewCollege.location || "N/A"}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CollegeManagement;
