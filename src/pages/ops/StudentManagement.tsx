import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Filter, Eye, Trash2,
  Download, Mail, Lock, CheckCircle, XCircle,
  GraduationCap, MapPin, Loader2,
} from "lucide-react";
import { API_BASE, api } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-rose-100 text-rose-700",
  pending: "bg-amber-100 text-amber-700",
};

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "-");

/** Just the clock time, e.g. "2:55 pm". Shown on its own line under the date so
 *  the Registered column does not get wider. Matches Internship Tracking. */
const fmtTime = (v?: string | null) =>
  v
    ? new Date(v)
        .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        .toLowerCase()
    : "";

interface StudentItem {
  id: number;
  email: string;
  status: string;
  email_verified: boolean;
  full_name: string | null;
  phone: string | null;
  college_name: string | null;
  course: string | null;
  current_year: string | null;
  member_id: string | null;
  created_at: string;
}

const StudentManagement = () => {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [viewStudent, setViewStudent] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Which row has a request in flight. Without this a slow action looks
  // identical to a dead button, which is how these read as "not working".
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchStudents = () => {
    setLoading(true);
    let url = `/ops/students?page=1&page_size=50`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (statusFilter !== "all") url += `&account_status=${statusFilter}`;

    api.get<any>(url)
      .then((res) => {
        setStudents(res.items || []);
        setTotal(res.total || 0);
        setLoading(false);
      })
      .catch(() => {
        setStudents([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStudents();
  }, [search, statusFilter]);

  const handleToggleStatus = (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    setBusyId(id);
    api.post(`/ops/students/${id}/status?status=${newStatus}`)
      .then(() => fetchStudents())
      .catch((err) => alert(err.message || "Failed to update status"))
      .finally(() => setBusyId(null));
  };

  const handleDeleteStudent = (id: number, nameOrEmail: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete student '${nameOrEmail}'?`)) return;
    setBusyId(id);
    // `del`, not `delete` -- the api client has no `delete` method, so the old
    // call threw before the request was ever sent and the button did nothing.
    api.del(`/ops/students/${id}`)
      .then(() => {
        setSelected((prev) => prev.filter((x) => x !== id));
        fetchStudents();
      })
      .catch((err) => alert(err.message || "Failed to delete student"))
      .finally(() => setBusyId(null));
  };

  const handleBulkDelete = () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Are you sure you want to permanently delete ${selected.length} selected student(s)?`)) return;

    setBulkDeleting(true);
    Promise.all(selected.map((id) => api.del(`/ops/students/${id}`)))
      .then(() => {
        setSelected([]);
        fetchStudents();
      })
      .catch((err) => {
        alert(err.message || "Error deleting some students");
        fetchStudents();
      })
      .finally(() => setBulkDeleting(false));
  };

  const handleViewStudent = (id: number) => {
    setDetailLoading(true);
    setBusyId(id);
    api.get<any>(`/ops/students/${id}`)
      .then((data) => setViewStudent(data))
      .catch((err) => alert(err.message || "Failed to load student details"))
      .finally(() => {
        setDetailLoading(false);
        setBusyId(null);
      });
  };

  const handleExportCsv = () => {
    // A file download, so this bypasses the JSON client: the body is a blob and
    // the session cookie has to ride along for the ops permission check.
    setExporting(true);
    fetch(`${API_BASE}/ops/reports/students/export?fmt=csv`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Your role does not have permission to export student data."
              : "Could not generate the export. Please try again.",
          );
        }
        const url = URL.createObjectURL(await res.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => alert(err.message || "Export failed"))
      .finally(() => setExporting(false));
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Student Management</h1>
          <p className="text-sm text-muted-foreground">{total} students registered in database</p>
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Selected ({selected.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
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
                placeholder="Search by name, email or phone..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
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
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No students found in the database.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="w-10 p-4">
                      <input
                        type="checkbox"
                        className="rounded"
                        onChange={(e) => setSelected(e.target.checked ? students.map((s) => s.id) : [])}
                        checked={selected.length === students.length && students.length > 0}
                      />
                    </th>
                    <th className="p-4 text-left font-semibold text-slate-600">Student</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Phone</th>
                    <th className="p-4 text-left font-semibold text-slate-600">College / Course</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Member ID</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Status</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Registered</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selected.includes(s.id)}
                          onChange={() => toggleSelect(s.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                            {(s.full_name || s.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{s.full_name || "No Name"}</p>
                            <p className="text-xs text-muted-foreground">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm">
                        {s.phone ? (
                          <a
                            href={`tel:${s.phone.replace(/\s+/g, "")}`}
                            className="whitespace-nowrap hover:text-accent hover:underline"
                          >
                            {s.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <p className="font-medium">{s.college_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{s.course ? `${s.course} (${s.current_year || ""})` : "—"}</p>
                      </td>
                      <td className="p-4 text-xs font-mono text-slate-600">{s.member_id || "—"}</td>
                      <td className="p-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[s.status] || "bg-slate-100"}`}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">
                        <div className="whitespace-nowrap">{fmtDate(s.created_at)}</div>
                        {s.created_at && (
                          <div className="whitespace-nowrap">{fmtTime(s.created_at)}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleViewStudent(s.id)}
                            disabled={busyId === s.id}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                            title="View Profile"
                          >
                            {busyId === s.id && detailLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleToggleStatus(s.id, s.status)}
                            disabled={busyId === s.id}
                            className={`rounded-md p-1.5 disabled:opacity-40 ${s.status === "active" ? "text-rose-400 hover:bg-rose-50 hover:text-rose-600" : "text-emerald-500 hover:bg-emerald-50"}`}
                            title={s.status === "active" ? "Suspend Student" : "Activate Student"}
                          >
                            {s.status === "active" ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(s.id, s.full_name || s.email)}
                            disabled={busyId === s.id}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                            title="Delete Student"
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

      {/* Student detail modal */}
      {viewStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-xl font-bold text-accent">
                  {(viewStudent.profile?.full_name || viewStudent.email)[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{viewStudent.profile?.full_name || "Student"}</h2>
                  <p className="text-sm text-muted-foreground">{viewStudent.email}</p>
                  <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[viewStudent.status] || "bg-slate-100"}`}>
                    {viewStudent.status}
                  </span>
                </div>
              </div>
              <button onClick={() => setViewStudent(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4">
                  <h4 className="mb-3 text-sm font-semibold">Academic Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-accent" /><span>{viewStudent.profile?.college_name || "Not set"}</span></div>
                    <p><span className="font-medium">Course:</span> {viewStudent.profile?.course || "—"}</p>
                    <p><span className="font-medium">Year:</span> {viewStudent.profile?.current_year || "—"}</p>
                    <p><span className="font-medium">Phone:</span> {viewStudent.profile?.phone || "—"}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <h4 className="mb-3 text-sm font-semibold">Membership</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Member ID:</span> {viewStudent.membership?.member_id || "N/A"}</p>
                    <p><span className="font-medium">Tier:</span> {viewStudent.membership?.tier || "Free Member"}</p>
                    <p><span className="font-medium">Profile Completeness:</span> {viewStudent.profile?.completion_percent || 0}%</p>
                  </div>
                </div>
              </div>

              {viewStudent.internship_history?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Internship History</h4>
                  <div className="space-y-2">
                    {viewStudent.internship_history.map((h: any, i: number) => (
                      <div key={i} className="flex justify-between border-b pb-2 text-xs">
                        <div>
                          <p className="font-semibold">{h.internship || "Internship"}</p>
                          <p className="text-muted-foreground">{h.company}</p>
                        </div>
                        <span className="font-medium capitalize text-accent">{h.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;
