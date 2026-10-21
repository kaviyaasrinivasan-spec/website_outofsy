import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Download, Search, CheckCircle2, Eye, Plus, Loader2,
  ShieldCheck, XCircle, Copy, AlertTriangle,
} from "lucide-react";
import { API_BASE, api } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  issued: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  revoked: "bg-rose-100 text-rose-700",
};

interface Cert {
  id: number;
  certificate_number: string | null;
  verification_code: string | null;
  application_id: number;
  status: string;
  issued_on: string | null;
  file_url: string | null;
  student: { id: number; full_name: string | null };
  internship: { id: number; title: string };
}

interface Eligible {
  application_id: number;
  student_name: string | null;
  internship_title: string;
  status: string;
}

/** Shape of the public /verify/{code} response. */
interface VerifyResult {
  valid: boolean;
  reason?: string;
  certificate_number?: string;
  student_name?: string | null;
  college_name?: string | null;
  internship_title?: string | null;
  company_name?: string | null;
  issued_on?: string | null;
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString() : "—";

const CertificateManagement = () => {
  const [certificates, setCertificates] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [viewCert, setViewCert] = useState<Cert | null>(null);

  // Bulk generate
  const [showGenerate, setShowGenerate] = useState(false);
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);

  // Verification widget
  const [verifyInput, setVerifyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const fetchCertificates = () => {
    setLoading(true);
    api.get<{ items?: Cert[] }>("/ops/certificates?page_size=200")
      .then((res) => setCertificates(res.items || []))
      .catch(() => setCertificates([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchCertificates, []);

  const act = (id: number, run: () => Promise<unknown>) => {
    setBusyId(id);
    run()
      .then(() => fetchCertificates())
      .catch((err: Error) => alert(err.message || "That action failed."))
      .finally(() => setBusyId(null));
  };

  const openGenerate = () => {
    setSelected(new Set());
    setShowGenerate(true);
    setEligibleLoading(true);
    api.get<{ items?: Eligible[] }>("/ops/certificates/eligible")
      .then((res) => setEligible(res.items || []))
      .catch(() => setEligible([]))
      .finally(() => setEligibleLoading(false));
  };

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBulkGenerate = () => {
    if (selected.size === 0) return;
    setGenerating(true);
    // The endpoint takes a bare array of application ids as its JSON body.
    fetch(`${API_BASE}/ops/certificates/bulk-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify([...selected]),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.detail || "Bulk generation failed");
        setShowGenerate(false);
        fetchCertificates();
        const created = body?.created?.length ?? 0;
        const skipped = body?.skipped ?? [];
        alert(
          `${created} certificate(s) created as pending — approve each one to render its PDF.` +
          (skipped.length
            ? `\n\nSkipped ${skipped.length}:\n` +
              skipped.map((s: any) => `· application ${s.application_id}: ${s.reason}`).join("\n")
            : ""),
        );
      })
      .catch((err: Error) => alert(err.message || "Bulk generation failed"))
      .finally(() => setGenerating(false));
  };

  const revoke = (c: Cert) => {
    const reason = window.prompt(
      `Revoke ${c.certificate_number}?\n\nIt will fail public verification from then on.\n\nReason (optional):`,
    );
    if (reason === null) return; // cancelled
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    act(c.id, () => api.post(`/ops/certificates/${c.id}/revoke${qs}`));
  };

  const runVerify = () => {
    const raw = verifyInput.trim();
    if (!raw) return;
    setVerifying(true);
    setVerifyResult(null);
    // Staff naturally type the certificate number, but the public endpoint keys
    // on the verification code, so translate when we already hold the row.
    const match = certificates.find(
      (c) => c.certificate_number?.toLowerCase() === raw.toLowerCase(),
    );
    const code = match?.verification_code || raw;

    api.get<VerifyResult>(`/verify/${encodeURIComponent(code)}`)
      .then((res) => setVerifyResult(res))
      .catch((err) => setVerifyResult({ valid: false, reason: err.message || "Verification failed." }))
      .finally(() => setVerifying(false));
  };

  const filtered = certificates.filter((c) => {
    const term = search.toLowerCase();
    const matchSearch =
      (c.student?.full_name || "").toLowerCase().includes(term) ||
      (c.internship?.title || "").toLowerCase().includes(term) ||
      (c.certificate_number || "").toLowerCase().includes(term);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = [
    { label: "Total", value: certificates.length, bg: "bg-blue-50 text-blue-700 border-blue-100" },
    { label: "Issued/Approved", value: certificates.filter((c) => c.status === "issued" || c.status === "approved").length, bg: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    { label: "Pending", value: certificates.filter((c) => c.status === "pending").length, bg: "bg-amber-50 text-amber-700 border-amber-100" },
    { label: "Revoked", value: certificates.filter((c) => c.status === "revoked").length, bg: "bg-rose-50 text-rose-700 border-rose-100" },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Certificate Management</h1>
          <p className="text-sm text-muted-foreground">{certificates.length} certificates total</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent/90" onClick={openGenerate}>
          <Plus className="mr-2 h-4 w-4" /> Generate Certificates
        </Button>
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by student, internship or certificate number..."
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
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="issued">Issued</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                {certificates.length === 0
                  ? 'No certificates yet. Use "Generate Certificates" once an internship is completed.'
                  : "No certificates match your filters."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="p-4 text-left font-semibold text-slate-600">Student</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Internship</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Issued</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Cert No.</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Status</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 transition-colors hover:bg-slate-50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                            {(c.student?.full_name || "C")[0].toUpperCase()}
                          </div>
                          <span className="font-medium">{c.student?.full_name || "Unknown"}</span>
                        </div>
                      </td>
                      <td className="p-4">{c.internship?.title || "—"}</td>
                      <td className="p-4 text-xs text-muted-foreground">{fmtDate(c.issued_on)}</td>
                      <td className="p-4">
                        {c.certificate_number ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">{c.certificate_number}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not generated</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[c.status] || "bg-slate-100 text-slate-700"}`}>
                          {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          {busyId === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-accent" />
                          ) : (
                            <>
                              <button
                                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="View details"
                                onClick={() => setViewCert(c)}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {c.status === "pending" && (
                                <button
                                  className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-50"
                                  title="Approve and render the PDF"
                                  onClick={() => act(c.id, () => api.post(`/ops/certificates/${c.id}/approve`))}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              )}
                              {(c.status === "approved" || c.status === "issued") && (
                                <a
                                  className="rounded-md p-1.5 text-blue-400 hover:bg-blue-50 hover:text-blue-600"
                                  title="Download PDF"
                                  href={`${API_BASE}/ops/certificates/${c.id}/download`}
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              )}
                              {c.status !== "revoked" && c.certificate_number && (
                                <button
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                                  title="Revoke"
                                  onClick={() => revoke(c)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                className="rounded-md p-1.5 text-purple-400 hover:bg-purple-50 hover:text-purple-600"
                                title="Run the public verification check"
                                onClick={() => {
                                  setVerifyInput(c.certificate_number || "");
                                  setVerifyResult(null);
                                  if (c.verification_code) {
                                    setVerifying(true);
                                    api.get<VerifyResult>(`/verify/${encodeURIComponent(c.verification_code)}`)
                                      .then(setVerifyResult)
                                      .catch((err) => setVerifyResult({ valid: false, reason: err.message }))
                                      .finally(() => setVerifying(false));
                                  }
                                }}
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cert verification widget */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificate Verification</CardTitle>
          <p className="text-sm text-muted-foreground">
            Runs the same public check an employer would. Accepts a certificate number
            or a verification code.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="e.g. OOS-2026-0001"
              className="flex-1"
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runVerify(); } }}
            />
            <Button className="bg-accent hover:bg-accent/90" onClick={runVerify} disabled={verifying}>
              {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify
            </Button>
          </div>

          {verifyResult && (
            verifyResult.valid ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-2 flex items-center gap-2 font-medium text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />Valid certificate
                </p>
                <div className="grid gap-1 text-sm text-emerald-900 sm:grid-cols-2">
                  <p><span className="opacity-70">Number:</span> {verifyResult.certificate_number}</p>
                  <p><span className="opacity-70">Student:</span> {verifyResult.student_name || "—"}</p>
                  <p><span className="opacity-70">Internship:</span> {verifyResult.internship_title || "—"}</p>
                  <p><span className="opacity-70">Company:</span> {verifyResult.company_name || "—"}</p>
                  <p><span className="opacity-70">College:</span> {verifyResult.college_name || "—"}</p>
                  <p><span className="opacity-70">Issued:</span> {fmtDate(verifyResult.issued_on)}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Not verified</p>
                  <p>{verifyResult.reason || "This certificate could not be verified."}</p>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Generate certificates */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Generate Certificates</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Completed internships that do not have a certificate yet.
                </p>
              </div>
              <button onClick={() => setShowGenerate(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              {eligibleLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                </div>
              ) : eligible.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing is eligible right now. A certificate can only be issued once an
                  internship is marked completed and the posting offers one.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.size === eligible.length && eligible.length > 0}
                        onChange={(e) =>
                          setSelected(e.target.checked
                            ? new Set(eligible.map((x) => x.application_id))
                            : new Set())
                        }
                      />
                      Select all {eligible.length}
                    </label>
                    <span className="text-sm text-muted-foreground">{selected.size} selected</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border">
                    {eligible.map((x) => (
                      <label
                        key={x.application_id}
                        className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-0 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selected.has(x.application_id)}
                          onChange={() => toggleSelected(x.application_id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {x.student_name || `Student (application ${x.application_id})`}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{x.internship_title}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
              <div className="flex gap-3">
                <Button
                  className="bg-accent hover:bg-accent/90"
                  disabled={generating || selected.size === 0}
                  onClick={runBulkGenerate}
                >
                  {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Generate {selected.size > 0 ? selected.size : ""}
                </Button>
                <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View certificate */}
      {viewCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{viewCert.certificate_number || "Certificate"}</CardTitle>
                <p className="text-sm text-muted-foreground">{viewCert.student?.full_name || "Unknown student"}</p>
              </div>
              <button onClick={() => setViewCert(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Internship", value: viewCert.internship?.title || "—" },
                  { label: "Status", value: viewCert.status },
                  { label: "Issued", value: fmtDate(viewCert.issued_on) },
                  { label: "Application", value: `#${viewCert.application_id}` },
                ].map((d) => (
                  <div key={d.label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className="font-medium capitalize">{d.value}</p>
                  </div>
                ))}
              </div>

              {viewCert.verification_code && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-muted-foreground">Verification code</p>
                  <div className="flex items-center gap-2">
                    <p className="break-all font-mono text-sm">{viewCert.verification_code}</p>
                    <button
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Copy"
                      onClick={() => navigator.clipboard?.writeText(viewCert.verification_code || "")}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(viewCert.status === "approved" || viewCert.status === "issued") && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`${API_BASE}/ops/certificates/${viewCert.id}/download`}>
                      <Download className="mr-2 h-4 w-4" />Download PDF
                    </a>
                  </Button>
                )}
                {viewCert.status === "pending" && (
                  <Button
                    size="sm"
                    className="bg-accent hover:bg-accent/90"
                    onClick={() => {
                      const c = viewCert;
                      setViewCert(null);
                      act(c.id, () => api.post(`/ops/certificates/${c.id}/approve`));
                    }}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />Approve
                  </Button>
                )}
                {viewCert.status !== "revoked" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-600"
                    onClick={() => { const c = viewCert; setViewCert(null); revoke(c); }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />Revoke
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CertificateManagement;
