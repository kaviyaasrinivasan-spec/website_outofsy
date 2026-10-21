import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Download, Edit, Eye, Copy, Pause,
  XCircle, CheckCircle2, Users, MapPin, Clock,
  DollarSign, Loader2, Archive, ArchiveRestore, Trash2,
} from "lucide-react";
import { api } from "@/lib/api";

const MODE_STYLE: Record<string, string> = {
  Remote: "bg-blue-100 text-blue-700",
  "On-site": "bg-slate-100 text-slate-600",
  Hybrid: "bg-purple-100 text-purple-700",
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  closed: "bg-rose-100 text-rose-700",
  draft: "bg-slate-100 text-slate-600",
};

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString() : "Not set";

/** An <input type="date"> only accepts YYYY-MM-DD, so trim whatever the API sent. */
const dateInput = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

const EMPTY_FORM = {
  company_id: "",
  title: "",
  department: "",
  duration: "",
  work_mode: "Hybrid",
  location: "",
  stipend: "",
  openings: 1,
  description: "",
  responsibilities: "",
  eligibility: "",
  required_skills: "",
  certificate_available: true,
  ppo_available: false,
  status: "active",
  start_date: "",
  end_date: "",
  last_date_to_apply: "",
};

interface InternshipItem {
  id: number;
  title: string;
  department: string | null;
  company: { id: number; name: string } | null;
  duration: string | null;
  work_mode: string | null;
  location: string | null;
  stipend: string | null;
  openings: number;
  certificate_available: boolean;
  ppo_available: boolean;
  start_date: string | null;
  end_date: string | null;
  last_date_to_apply: string | null;
  status: string;
  is_archived?: boolean;
  application_count?: number;
  created_at: string;
}

const InternshipManagement = () => {
  const location = useLocation();
  /** The sidebar's "Create Internship" link routes here; open the form rather
   *  than dropping the user on the list with nothing apparently happening. */
  const wantsCreate = location.pathname === "/ops/internships/create";

  const [internships, setInternships] = useState<InternshipItem[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(wantsCreate);
  /** Set while the form is editing an existing listing; null means creating. */
  const [editId, setEditId] = useState<number | null>(null);

  useEffect(() => { if (wantsCreate) setShowCreate(true); }, [wantsCreate]);
  const [viewInternship, setViewInternship] = useState<any | null>(null);
  /** Which card has a request in flight, so its buttons cannot be double-fired. */
  const [busyId, setBusyId] = useState<number | null>(null);

  // Form state, shared by the create and edit modes of the same modal.
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditId(null);
    setFormData({ ...EMPTY_FORM });
    setShowCreate(true);
  };

  const closeForm = () => {
    setShowCreate(false);
    setEditId(null);
    setFormData({ ...EMPTY_FORM });
  };

  const fetchInternships = () => {
    setLoading(true);
    let url = `/ops/internships?page=1&page_size=50`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (statusFilter !== "all") url += `&status=${statusFilter}`;

    api.get<any>(url)
      .then((res) => {
        setInternships(res.items || []);
        setTotal(res.total || 0);
        setLoading(false);
      })
      .catch(() => {
        setInternships([]);
        setLoading(false);
      });
  };

  const fetchCompanies = () => {
    api.get<any>("/ops/companies?page=1&page_size=100")
      .then((res) => setCompanies(res.items || []))
      .catch(() => setCompanies([]));
  };

  useEffect(() => {
    fetchInternships();
    fetchCompanies();
  }, [search, statusFilter]);

  /** Empty strings are sent as null: the API's optional fields reject "" for
   *  dates, and a blank text box means "not set", not "the empty string". */
  const buildPayload = () => ({
    company_id: Number(formData.company_id),
    title: formData.title.trim(),
    department: formData.department || null,
    duration: formData.duration || null,
    work_mode: formData.work_mode || null,
    location: formData.location || null,
    stipend: formData.stipend || null,
    openings: Number(formData.openings) || 1,
    description: formData.description || null,
    responsibilities: formData.responsibilities || null,
    eligibility: formData.eligibility || null,
    required_skills: formData.required_skills || null,
    certificate_available: formData.certificate_available,
    ppo_available: formData.ppo_available,
    status: formData.status,
    start_date: formData.start_date || null,
    end_date: formData.end_date || null,
    // End of day, so "apply by the 10th" still lets students apply on the 10th.
    last_date_to_apply: formData.last_date_to_apply
      ? `${formData.last_date_to_apply}T23:59:59`
      : null,
  });

  const handleSaveInternship = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.company_id) {
      return alert("Title and Company are required");
    }
    // Caught here as well as server-side, so the modal does not have to be
    // re-filled after a round trip.
    if (formData.start_date && formData.end_date &&
        formData.end_date < formData.start_date) {
      return alert("End date cannot be before the start date.");
    }

    setSaving(true);
    const body = buildPayload();
    const req = editId
      ? api.patch(`/ops/internships/${editId}`, body)
      : api.post("/ops/internships", body);

    req
      .then(() => {
        closeForm();
        fetchInternships();
      })
      .catch((err) =>
        alert(err.message || `Failed to ${editId ? "update" : "create"} internship`))
      .finally(() => setSaving(false));
  };

  const handleEdit = (id: number) => {
    // Fetched rather than reused from the row, for the same reason as View:
    // the list omits the description, responsibilities and eligibility.
    setBusyId(id);
    api.get<any>(`/ops/internships/${id}`)
      .then((r) => {
        setFormData({
          company_id: r.company?.id ? String(r.company.id) : "",
          title: r.title || "",
          department: r.department || "",
          duration: r.duration || "",
          work_mode: r.work_mode || "Hybrid",
          location: r.location || "",
          stipend: r.stipend || "",
          openings: r.openings ?? 1,
          description: r.description || "",
          responsibilities: r.responsibilities || "",
          eligibility: r.eligibility || "",
          required_skills: r.required_skills || "",
          certificate_available: r.certificate_available ?? true,
          ppo_available: r.ppo_available ?? false,
          status: r.status || "draft",
          start_date: dateInput(r.start_date),
          end_date: dateInput(r.end_date),
          last_date_to_apply: dateInput(r.last_date_to_apply),
        });
        setEditId(id);
        setViewInternship(null);
        setShowCreate(true);
      })
      .catch((err) => alert(err.message || "Failed to load the internship"))
      .finally(() => setBusyId(null));
  };

  const handleSetStatus = (id: number, newStatus: string) => {
    setBusyId(id);
    api.post(`/ops/internships/${id}/status?status=${newStatus}`)
      .then(() => fetchInternships())
      .catch((err) => alert(err.message || "Failed to update status"))
      .finally(() => setBusyId(null));
  };

  const handleClone = (id: number) => {
    setBusyId(id);
    api.post(`/ops/internships/${id}/clone`)
      .then(() => fetchInternships())
      .catch((err) => alert(err.message || "Failed to clone internship"))
      .finally(() => setBusyId(null));
  };

  const handleView = (i: InternshipItem) => {
    // Fetched rather than reused from the row: the list omits the description,
    // responsibilities and eligibility text.
    setBusyId(i.id);
    api.get<any>(`/ops/internships/${i.id}`)
      .then((res) => setViewInternship(res))
      .catch((err) => alert(err.message || "Failed to load the internship"))
      .finally(() => setBusyId(null));
  };

  const handleActivate = (i: InternshipItem) => {
    // Resuming a paused listing needs no ceremony -- it was already public.
    // Going live from draft or closed does, since students will now see it.
    if (i.status !== "paused") {
      const verb = i.status === "draft" ? "Publish" : "Reopen";
      const expired =
        i.last_date_to_apply && new Date(i.last_date_to_apply) < new Date();
      if (!window.confirm(
        `${verb} "${i.title}"?\n\nIt becomes visible to students on the public ` +
        "site and open for applications." +
        (expired
          ? `\n\nNote: its application deadline (` +
            `${new Date(i.last_date_to_apply!).toLocaleDateString()}) has passed, ` +
            "so students will see it but cannot apply until you extend the date."
          : ""),
      )) return;
    }
    handleSetStatus(i.id, "active");
  };

  const handleArchive = (i: InternshipItem) => {
    const archiving = !i.is_archived;
    if (archiving) {
      const extra = i.status === "active"
        ? " It is currently active, so it will also be closed."
        : "";
      if (!window.confirm(
        `Archive "${i.title}"?\n\nIt will be hidden from this list and from the ` +
        `public site. Nothing is deleted — its ${i.application_count || 0} ` +
        `application(s) are kept, and you can restore it from the Archived tab.${extra}`,
      )) return;
    }

    setBusyId(i.id);
    api.post(`/ops/internships/${i.id}/archive?archived=${archiving}`)
      .then(() => fetchInternships())
      .catch((err) => alert(err.message || "Failed to archive internship"))
      .finally(() => setBusyId(null));
  };

  const handleDelete = (i: InternshipItem) => {
    const count = i.application_count || 0;
    // The server refuses outright once applications exist, so say so here
    // rather than letting the click fail with a raw error.
    if (count > 0) {
      return alert(
        `"${i.title}" has ${count} student application(s) and cannot be deleted — ` +
        "deleting it would destroy their applications and tracking records.\n\n" +
        "Archive it instead: the listing disappears from the list and the public " +
        "site, and the applications are kept.",
      );
    }
    if (!window.confirm(
      `Permanently delete "${i.title}"?\n\nThis cannot be undone. ` +
      "Archive it instead if you only want it out of the way.",
    )) return;

    setBusyId(i.id);
    api.del(`/ops/internships/${i.id}`)
      .then(() => fetchInternships())
      .catch((err) => alert(err.message || "Failed to delete internship"))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Internship Management</h1>
          <p className="text-sm text-muted-foreground">{total} internships registered in database</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-accent hover:bg-accent/90" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Create Internship
          </Button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {/* "Archived" is a view rather than a status: it is the only tab that
            shows archived listings, and every other tab hides them. */}
        {["all", "active", "paused", "closed", "draft", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${statusFilter === s ? "bg-accent text-white" : "bg-white border border-border text-slate-600 hover:bg-slate-50"}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search internships..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Internship grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : internships.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground bg-white rounded-xl border">
          No internships found in database. Click "Create Internship" to post one.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {internships.map((i) => {
            const busy = busyId === i.id;
            return (
            <Card key={i.id} className={`hover-lift ${i.is_archived ? "opacity-75" : ""}`}>
              <CardContent className="p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{i.title}</h3>
                    <p className="text-sm text-muted-foreground">{i.company?.name || "No Company"} · {i.department || "General"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${MODE_STYLE[i.work_mode || "Hybrid"] || "bg-slate-100"}`}>{i.work_mode || "Hybrid"}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[i.status] || "bg-slate-100"}`}>{i.status}</span>
                    {i.is_archived && (
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                        archived
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-accent" />{i.duration || "N/A"}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-accent" />{i.location || "N/A"}</span>
                  <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 text-accent" />{i.stipend || "Unpaid"}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-accent" />{i.openings} openings</span>
                </div>

                <div className="mb-4 flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> {i.application_count || 0} applicants
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => handleView(i)}>
                    <Eye className="mr-1 h-3.5 w-3.5" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-accent"
                    disabled={busy}
                    onClick={() => handleEdit(i.id)}
                    title="Edit this listing's details, openings, dates and status"
                  >
                    <Edit className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => handleClone(i.id)}>
                    {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Copy className="mr-1 h-3.5 w-3.5" />} Clone
                  </Button>
                  {/* An archived listing only offers Restore and Delete -- the
                      lifecycle buttons would be acting on something nobody can
                      see. */}
                  {!i.is_archived && (
                    <>
                      {i.status === "active" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-amber-600" disabled={busy} onClick={() => handleSetStatus(i.id, "paused")}>
                          <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                        </Button>
                      ) : (
                        // Anything not active can be made active. Previously only
                        // 'paused' had a button, so a closed or draft listing had
                        // no way back to live at all.
                        <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" disabled={busy} onClick={() => handleActivate(i)}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          {i.status === "paused" ? "Resume" : i.status === "draft" ? "Publish" : "Reopen"}
                        </Button>
                      )}
                      {i.status !== "closed" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-rose-600" disabled={busy} onClick={() => handleSetStatus(i.id, "closed")}>
                          <XCircle className="mr-1 h-3.5 w-3.5" /> Close
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-slate-600"
                    disabled={busy}
                    onClick={() => handleArchive(i)}
                    // An archived listing has no lifecycle buttons, so spell out
                    // that restoring is the first of two steps back to live.
                    title={i.is_archived
                      ? "Restore to the working list — then Reopen to make it live again"
                      : "Hide from this list and the public site, keeping its applications"}
                  >
                    {i.is_archived ? (
                      <><ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Restore</>
                    ) : (
                      <><Archive className="mr-1 h-3.5 w-3.5" /> Archive</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-rose-600"
                    disabled={busy}
                    onClick={() => handleDelete(i)}
                    title={
                      (i.application_count || 0) > 0
                        ? "Cannot delete a listing with applications — archive it instead"
                        : "Permanently delete this listing"
                    }
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Internship detail. The View button used to set this state with nothing
          rendering it, so clicking View did nothing at all. */}
      {viewInternship && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{viewInternship.title}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {viewInternship.company?.name || "No company"} · {viewInternship.department || "General"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${MODE_STYLE[viewInternship.work_mode || "Hybrid"] || "bg-slate-100"}`}>
                    {viewInternship.work_mode || "Hybrid"}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[viewInternship.status] || "bg-slate-100"}`}>
                    {viewInternship.status}
                  </span>
                  {viewInternship.is_archived && (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                      archived
                    </span>
                  )}
                  {viewInternship.is_featured && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                      featured
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setViewInternship(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4 text-sm">
                  <h4 className="mb-3 font-semibold">The role</h4>
                  <div className="space-y-2">
                    <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-accent" />{viewInternship.duration || "Duration not set"}</p>
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" />{viewInternship.location || "Location not set"}</p>
                    <p className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-accent" />{viewInternship.stipend || "Unpaid"}</p>
                    <p className="flex items-center gap-2"><Users className="h-4 w-4 text-accent" />{viewInternship.openings} opening(s)</p>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-4 text-sm">
                  <h4 className="mb-3 font-semibold">Dates &amp; interest</h4>
                  <div className="space-y-2">
                    <p><span className="font-medium">Starts:</span> {fmtDate(viewInternship.start_date)}</p>
                    <p><span className="font-medium">Ends:</span> {fmtDate(viewInternship.end_date)}</p>
                    <p><span className="font-medium">Apply by:</span> {fmtDate(viewInternship.last_date_to_apply)}</p>
                    <p><span className="font-medium">Applicants:</span> {viewInternship.application_count ?? 0}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-1 font-medium ${viewInternship.certificate_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {viewInternship.certificate_available ? "Certificate provided" : "No certificate"}
                </span>
                <span className={`rounded-full px-2.5 py-1 font-medium ${viewInternship.ppo_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {viewInternship.ppo_available ? "PPO possible" : "No PPO"}
                </span>
              </div>

              {[
                ["Description", viewInternship.description],
                ["Responsibilities", viewInternship.responsibilities],
                ["Eligibility", viewInternship.eligibility],
                ["Required skills", viewInternship.required_skills],
              ].map(([heading, body]) => (
                <div key={heading as string}>
                  <h4 className="mb-1 text-sm font-semibold">{heading}</h4>
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    {(body as string) || "Not provided."}
                  </p>
                </div>
              ))}

              <p className="text-xs text-muted-foreground">
                Created {fmtDate(viewInternship.created_at)}
              </p>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEdit(viewInternship.id)}>
                  <Edit className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" onClick={() => setViewInternship(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create / Edit Internship Modal — one form, two modes. */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{editId ? "Edit Internship Listing" : "Create Internship Listing"}</CardTitle>
              <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveInternship} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-sm font-medium">Internship Title *</label>
                    <Input
                      placeholder="e.g., Frontend Developer Intern"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Company *</label>
                    <select
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                      value={formData.company_id}
                      onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                      required
                    >
                      <option value="">-- Select Company --</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Department</label>
                    <Input
                      placeholder="e.g., Engineering"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Duration</label>
                    <Input
                      placeholder="e.g., 3 Months"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Openings</label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.openings}
                      onChange={(e) => setFormData({ ...formData, openings: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Mode</label>
                    <select
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                      value={formData.work_mode}
                      onChange={(e) => setFormData({ ...formData, work_mode: e.target.value })}
                    >
                      <option value="Hybrid">Hybrid</option>
                      <option value="Remote">Remote</option>
                      <option value="On-site">On-site</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Location</label>
                    <Input
                      placeholder="e.g. Chennai"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Stipend</label>
                    <Input
                      placeholder="e.g., ₹15,000/mo or Unpaid"
                      value={formData.stipend}
                      onChange={(e) => setFormData({ ...formData, stipend: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Required Skills</label>
                    <Input
                      placeholder="React, Python (comma separated)"
                      value={formData.required_skills}
                      onChange={(e) => setFormData({ ...formData, required_skills: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Status</label>
                    <select
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Start Date</label>
                    <Input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">End Date</label>
                    <Input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Last Date to Apply</label>
                    <Input
                      type="date"
                      value={formData.last_date_to_apply}
                      onChange={(e) => setFormData({ ...formData, last_date_to_apply: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={formData.certificate_available}
                      onChange={(e) => setFormData({ ...formData, certificate_available: e.target.checked })}
                    />
                    Certificate provided
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={formData.ppo_available}
                      onChange={(e) => setFormData({ ...formData, ppo_available: e.target.checked })}
                    />
                    PPO possible
                  </label>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Role responsibilities..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Responsibilities</label>
                  <textarea
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    rows={3}
                    placeholder="What the intern will actually do..."
                    value={formData.responsibilities}
                    onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Eligibility</label>
                  <textarea
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Year, branch, minimum CGPA..."
                    value={formData.eligibility}
                    onChange={(e) => setFormData({ ...formData, eligibility: e.target.value })}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={saving} className="bg-accent hover:bg-accent/90">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editId ? "Save Changes" : "Create Internship"}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default InternshipManagement;
