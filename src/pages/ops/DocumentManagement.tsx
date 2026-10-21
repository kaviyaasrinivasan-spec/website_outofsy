import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Upload, Download, Trash2, CheckCircle2, XCircle,
  FileText, Award, File, Briefcase, GraduationCap, Loader2,
} from "lucide-react";
import { API_BASE, api } from "@/lib/api";

/** Mirrors DOCUMENT_KINDS on the server -- the keys must match exactly. The
 *  labels, icons and colours are presentation only; counts come from the API. */
const CATEGORY_META: { key: string; label: string; icon: typeof FileText; color: string }[] = [
  { key: "resume", label: "Resumes", icon: FileText, color: "text-blue-600 bg-blue-50" },
  { key: "college_id", label: "College IDs", icon: GraduationCap, color: "text-indigo-600 bg-indigo-50" },
  { key: "marksheet", label: "Marksheets", icon: File, color: "text-purple-600 bg-purple-50" },
  { key: "offer_letter", label: "Offer Letters", icon: Briefcase, color: "text-amber-600 bg-amber-50" },
  { key: "joining_letter", label: "Joining Letters", icon: FileText, color: "text-teal-600 bg-teal-50" },
  { key: "internship_report", label: "Internship Reports", icon: File, color: "text-cyan-600 bg-cyan-50" },
  { key: "completion_report", label: "Completion Reports", icon: File, color: "text-green-600 bg-green-50" },
  { key: "company_agreement", label: "Company Agreements", icon: Briefcase, color: "text-slate-600 bg-slate-50" },
  { key: "mou", label: "MoUs", icon: Award, color: "text-rose-600 bg-rose-50" },
  { key: "registration_certificate", label: "Registration Certs", icon: Award, color: "text-orange-600 bg-orange-50" },
  { key: "other", label: "Other", icon: File, color: "text-slate-600 bg-slate-50" },
];

const LABEL_OF = (kind: string) =>
  CATEGORY_META.find((c) => c.key === kind)?.label.replace(/s$/, "") || kind.replace(/_/g, " ");

interface DocRow {
  id: number;
  owner_type: string;
  owner_id: number;
  owner_name: string | null;
  kind: string;
  file_url: string | null;
  original_filename: string | null;
  size_bytes: number | null;
  is_verified: boolean;
  created_at: string | null;
}

interface Summary {
  total: number;
  verified: number;
  pending: number;
  by_kind: Record<string, number>;
}

const fmtSize = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

const DocumentManagement = () => {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, verified: 0, pending: 0, by_kind: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadKind, setUploadKind] = useState("");
  const [uploadOwnerType, setUploadOwnerType] = useState("student");
  const [uploadOwnerId, setUploadOwnerId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const fetchDocs = () => {
    setLoading(true);
    let url = "/ops/documents?page=1&page_size=200";
    if (activeCategory !== "all") url += `&kind=${activeCategory}`;
    if (statusFilter !== "all") url += `&is_verified=${statusFilter === "verified"}`;
    if (ownerFilter !== "all") url += `&owner_type=${ownerFilter}`;

    Promise.all([
      api.get<{ items?: DocRow[] }>(url),
      api.get<Summary>("/ops/documents/summary"),
    ])
      .then(([list, sum]) => {
        setDocs(list.items || []);
        setSummary(sum);
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Could not load documents.");
        setDocs([]);
        setLoading(false);
      });
  };

  useEffect(fetchDocs, [activeCategory, statusFilter, ownerFilter]);

  const act = (id: number, run: () => Promise<unknown>) => {
    setBusyId(id);
    run()
      .then(() => fetchDocs())
      .catch((err: Error) => alert(err.message || "That action failed."))
      .finally(() => setBusyId(null));
  };

  const handleDelete = (d: DocRow) => {
    if (!window.confirm(
      `Delete "${d.original_filename || LABEL_OF(d.kind)}"?\n\n` +
      "The uploaded file is removed and this cannot be undone.",
    )) return;
    act(d.id, () => api.del(`/ops/documents/${d.id}`));
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !uploadKind || !uploadOwnerId) {
      setUploadError("Document type, owner and file are all required.");
      return;
    }
    setUploadError("");
    setUploading(true);

    // Multipart, so this goes through fetch directly rather than the JSON client.
    const form = new FormData();
    form.append("file", file);
    form.append("owner_type", uploadOwnerType);
    form.append("owner_id", uploadOwnerId);
    form.append("kind", uploadKind);

    fetch(`${API_BASE}/ops/documents`, { method: "POST", body: form, credentials: "include" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.detail || "Upload failed");
        setShowUpload(false);
        setFile(null);
        setUploadKind("");
        setUploadOwnerId("");
        fetchDocs();
      })
      .catch((err: Error) => setUploadError(err.message || "Upload failed"))
      .finally(() => setUploading(false));
  };

  // Filename and owner search stays client-side: the server has no text search
  // on documents, and a page of 200 filters instantly.
  const filtered = docs.filter((d) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (d.original_filename || "").toLowerCase().includes(term)
      || (d.owner_name || "").toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Document Management</h1>
          <p className="text-sm text-muted-foreground">
            {summary.total.toLocaleString()} documents stored · {summary.pending} awaiting verification
          </p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent/90" onClick={() => setShowUpload(true)}>
          <Upload className="mr-2 h-4 w-4" />Upload Document
        </Button>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* Category cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          onClick={() => setActiveCategory("all")}
          className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${activeCategory === "all" ? "border-accent bg-accent/5" : "border-border bg-white"}`}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 mb-2">
            <FileText className="h-4 w-4 text-slate-600" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">All Documents</p>
          <p className="text-xl font-bold text-slate-800">{summary.total.toLocaleString()}</p>
        </button>
        {CATEGORY_META.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${activeCategory === cat.key ? "border-accent bg-accent/5" : "border-border bg-white"}`}
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg mb-2 ${cat.color}`}>
              <cat.icon className="h-4 w-4" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{cat.label}</p>
            <p className="text-xl font-bold text-slate-800">
              {(summary.by_kind[cat.key] || 0).toLocaleString()}
            </p>
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
                placeholder="Search by filename or owner..."
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
              <option value="all">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
            </select>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">All Owners</option>
              <option value="student">Students</option>
              <option value="company">Companies</option>
              <option value="college">Colleges</option>
            </select>
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">All Types</option>
              {CATEGORY_META.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Documents table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="p-4 text-left font-semibold text-slate-600">Document</th>
                      <th className="p-4 text-left font-semibold text-slate-600">Owner</th>
                      <th className="p-4 text-left font-semibold text-slate-600">Type</th>
                      <th className="p-4 text-left font-semibold text-slate-600">Size</th>
                      <th className="p-4 text-left font-semibold text-slate-600">Uploaded</th>
                      <th className="p-4 text-left font-semibold text-slate-600">Status</th>
                      <th className="p-4 text-left font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((doc) => {
                      const cat = CATEGORY_META.find((c) => c.key === doc.kind);
                      return (
                        <tr key={doc.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cat?.color || "bg-slate-100 text-slate-500"}`}>
                                {cat ? <cat.icon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                              </div>
                              <p className="max-w-[220px] truncate font-medium text-slate-800">
                                {doc.original_filename || `Document #${doc.id}`}
                              </p>
                            </div>
                          </td>
                          <td className="p-4">
                            <p className="text-sm font-medium">
                              {doc.owner_name || `#${doc.owner_id}`}
                            </p>
                            <p className="text-xs capitalize text-muted-foreground">{doc.owner_type}</p>
                          </td>
                          <td className="p-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cat?.color || "bg-slate-100 text-slate-600"}`}>
                              {LABEL_OF(doc.kind)}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-muted-foreground">{fmtSize(doc.size_bytes)}</td>
                          <td className="p-4 text-xs text-muted-foreground">{fmtDate(doc.created_at)}</td>
                          <td className="p-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${doc.is_verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {doc.is_verified ? "Verified" : "Pending"}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              {busyId === doc.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                              ) : (
                                <>
                                  <a
                                    href={`${API_BASE}/ops/documents/${doc.id}/download`}
                                    className="rounded-md p-1.5 text-blue-400 hover:bg-blue-50"
                                    title="Download"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                  {doc.is_verified ? (
                                    <button
                                      className="rounded-md p-1.5 text-amber-400 hover:bg-amber-50"
                                      title="Mark unverified"
                                      onClick={() => act(doc.id, () => api.post(`/ops/documents/${doc.id}/verify?verified=false`))}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <button
                                      className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-50"
                                      title="Verify"
                                      onClick={() => act(doc.id, () => api.post(`/ops/documents/${doc.id}/verify?verified=true`))}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                                    title="Delete"
                                    onClick={() => handleDelete(doc)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-muted-foreground">
                          {summary.total === 0
                            ? "No documents have been uploaded yet."
                            : "No documents match your filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Showing {filtered.length} of {summary.total} documents
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Upload Document</CardTitle>
              <button onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Document Type *</label>
                  <select
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value)}
                    required
                  >
                    <option value="">Select Type</option>
                    {CATEGORY_META.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Belongs To *</label>
                    <select
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                      value={uploadOwnerType}
                      onChange={(e) => setUploadOwnerType(e.target.value)}
                    >
                      <option value="student">Student</option>
                      <option value="company">Company</option>
                      <option value="college">College</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Owner ID *</label>
                    <Input
                      type="number"
                      placeholder="e.g. 14"
                      value={uploadOwnerId}
                      onChange={(e) => setUploadOwnerId(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div
                  className="cursor-pointer rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-accent"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                  {file ? (
                    <p className="font-medium text-slate-700">{file.name}</p>
                  ) : (
                    <>
                      <p className="mb-1 font-medium text-slate-600">Click to choose a file</p>
                      <p className="text-sm text-muted-foreground">PDF, JPG, PNG, DOCX</p>
                    </>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
                {uploadError && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{uploadError}</p>
                )}
                <div className="flex gap-3">
                  <Button type="submit" disabled={uploading} className="bg-accent hover:bg-accent/90">
                    {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Upload Document
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DocumentManagement;
