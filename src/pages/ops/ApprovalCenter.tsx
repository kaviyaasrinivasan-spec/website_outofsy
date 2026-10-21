import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2, XCircle, Building2, GraduationCap, Briefcase,
  Users, Award, Loader2, RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";

interface PendingCompany { id: number; name: string; industry: string | null; created_at: string | null }
interface PendingCollege { id: number; name: string; university: string | null; created_at: string | null }
interface PendingInternship { id: number; title: string; company: string | null; created_at: string | null }
interface PendingDocument { id: number; kind: string; owner_type: string; owner_id: number; created_at: string | null }
interface PendingCertificate { id: number; certificate_number: string; created_at: string | null }

interface Approvals {
  counts: { companies: number; colleges: number; internships: number; documents: number; certificates: number };
  companies: PendingCompany[];
  colleges: PendingCollege[];
  internships: PendingInternship[];
  documents: PendingDocument[];
  certificates: PendingCertificate[];
}

const EMPTY: Approvals = {
  counts: { companies: 0, colleges: 0, internships: 0, documents: 0, certificates: 0 },
  companies: [], colleges: [], internships: [], documents: [], certificates: [],
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

const ApprovalRow = ({
  children, onApprove, onReject, busy, approveLabel = "Approve", rejectLabel = "Reject",
}: {
  children: React.ReactNode;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
  approveLabel?: string;
  rejectLabel?: string;
}) => (
  <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 hover:bg-slate-50 transition-colors">
    <div className="flex-1 min-w-0">{children}</div>
    <div className="flex shrink-0 items-center gap-2">
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
      ) : (
        <>
          <button
            onClick={onApprove}
            className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> {approveLabel}
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 transition"
          >
            <XCircle className="h-3.5 w-3.5" /> {rejectLabel}
          </button>
        </>
      )}
    </div>
  </div>
);

const EmptyQueue = ({ what }: { what: string }) => (
  <div className="rounded-lg border border-dashed border-border p-8 text-center">
    <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
    <p className="text-sm text-muted-foreground">No {what} are waiting for approval.</p>
  </div>
);

const ApprovalCenter = () => {
  const [data, setData] = useState<Approvals>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** Keyed "type:id" so two rows can never be mistaken for each other. */
  const [busy, setBusy] = useState<string | null>(null);

  const fetchApprovals = () => {
    setLoading(true);
    api.get<Approvals>("/ops/approvals?limit=100")
      .then((res) => {
        setData({ ...EMPTY, ...res });
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Could not load the approval queue.");
        setData(EMPTY);
        setLoading(false);
      });
  };

  useEffect(fetchApprovals, []);

  /** Every action refetches, so the counts and tabs stay in step with the server. */
  const act = (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    run()
      .then(() => fetchApprovals())
      .catch((err: Error) => alert(err.message || "That action failed."))
      .finally(() => setBusy(null));
  };

  const counts = data.counts;
  const totalPending =
    counts.companies + counts.colleges + counts.internships + counts.documents + counts.certificates;

  const summary = [
    { label: "Companies", count: counts.companies, icon: Building2, color: "text-purple-600 bg-purple-50 border-purple-100" },
    { label: "Colleges", count: counts.colleges, icon: GraduationCap, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    { label: "Internships", count: counts.internships, icon: Briefcase, color: "text-accent bg-accent/10 border-accent/20" },
    { label: "Documents", count: counts.documents, icon: Users, color: "text-blue-600 bg-blue-50 border-blue-100" },
    { label: "Certificates", count: counts.certificates, icon: Award, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  ];

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Approval Center</h1>
          <p className="text-sm text-muted-foreground">
            {totalPending === 0 ? "Nothing is waiting for approval" : `${totalPending} items pending your approval`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchApprovals}
            className="rounded-lg border border-border p-2 text-slate-500 hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-lg font-bold text-amber-700">
            {totalPending}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {summary.map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-4 w-4" />
              <span className="text-xs font-medium">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">{s.count}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="companies">
        <TabsList>
          {[
            { v: "companies", label: "Companies", n: counts.companies },
            { v: "colleges", label: "Colleges", n: counts.colleges },
            { v: "internships", label: "Internships", n: counts.internships },
            { v: "documents", label: "Documents", n: counts.documents },
            { v: "certs", label: "Certificates", n: counts.certificates },
          ].map((t) => (
            <TabsTrigger key={t.v} value={t.v}>
              {t.label}{" "}
              <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{t.n}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* COMPANIES -- approve verifies, reject deactivates */}
        <TabsContent value="companies" className="mt-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Company Verification</h3>
          {data.companies.length === 0 ? <EmptyQueue what="companies" /> : data.companies.map((c) => (
            <ApprovalRow
              key={c.id}
              busy={busy === `company:${c.id}`}
              approveLabel="Verify"
              rejectLabel="Deactivate"
              onApprove={() => act(`company:${c.id}`, () => api.post(`/ops/companies/${c.id}/verify?approve=true`))}
              onReject={() => {
                if (!window.confirm(`Deactivate "${c.name}"?\n\nIt stays in the database but drops out of this queue and off the site.`)) return;
                act(`company:${c.id}`, () => api.post(`/ops/companies/${c.id}/status?is_active=false`));
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-sm font-bold text-purple-700">
                  {c.name[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.industry || "Industry not set"}</p>
                  <p className="text-xs text-muted-foreground">Registered: {fmtDate(c.created_at)}</p>
                </div>
              </div>
            </ApprovalRow>
          ))}
        </TabsContent>

        {/* COLLEGES -- partnership_status pending -> approved / suspended */}
        <TabsContent value="colleges" className="mt-4 space-y-3">
          <h3 className="font-semibold text-slate-700">College Partnerships</h3>
          {data.colleges.length === 0 ? <EmptyQueue what="colleges" /> : data.colleges.map((c) => (
            <ApprovalRow
              key={c.id}
              busy={busy === `college:${c.id}`}
              rejectLabel="Suspend"
              // The dedicated status endpoint, not PATCH /colleges/{id} -- that one
              // takes a whole CollegeIn body and 422s on a partial update.
              onApprove={() => act(`college:${c.id}`, () => api.post(`/ops/colleges/${c.id}/status?partnership_status=approved`))}
              onReject={() => act(`college:${c.id}`, () => api.post(`/ops/colleges/${c.id}/status?partnership_status=suspended`))}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-sm font-bold text-indigo-700">
                  {c.name[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.university || "University not set"}</p>
                  <p className="text-xs text-muted-foreground">Registered: {fmtDate(c.created_at)}</p>
                </div>
              </div>
            </ApprovalRow>
          ))}
        </TabsContent>

        {/* INTERNSHIPS -- draft -> active / closed */}
        <TabsContent value="internships" className="mt-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Draft Internships</h3>
          {data.internships.length === 0 ? <EmptyQueue what="internships" /> : data.internships.map((i) => (
            <ApprovalRow
              key={i.id}
              busy={busy === `internship:${i.id}`}
              approveLabel="Publish"
              rejectLabel="Close"
              onApprove={() => act(`internship:${i.id}`, () => api.post(`/ops/internships/${i.id}/status?status=active`))}
              onReject={() => act(`internship:${i.id}`, () => api.post(`/ops/internships/${i.id}/status?status=closed`))}
            >
              <div>
                <p className="font-semibold text-slate-800">{i.title}</p>
                <p className="text-xs text-muted-foreground">{i.company || "Company not set"}</p>
                <p className="text-xs text-muted-foreground">Created: {fmtDate(i.created_at)}</p>
              </div>
            </ApprovalRow>
          ))}
        </TabsContent>

        {/* DOCUMENTS -- verify, or delete the upload outright */}
        <TabsContent value="documents" className="mt-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Document Verification</h3>
          {data.documents.length === 0 ? <EmptyQueue what="documents" /> : data.documents.map((d) => (
            <ApprovalRow
              key={d.id}
              busy={busy === `document:${d.id}`}
              approveLabel="Verify"
              rejectLabel="Delete"
              onApprove={() => act(`document:${d.id}`, () => api.post(`/ops/documents/${d.id}/verify?verified=true`))}
              onReject={() => {
                if (!window.confirm("Delete this document?\n\nThe uploaded file is removed and this cannot be undone.")) return;
                act(`document:${d.id}`, () => api.del(`/ops/documents/${d.id}`));
              }}
            >
              <div>
                <p className="font-semibold text-slate-800">{d.kind.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{d.owner_type} #{d.owner_id}</p>
                <p className="text-xs text-muted-foreground">Uploaded: {fmtDate(d.created_at)}</p>
              </div>
            </ApprovalRow>
          ))}
        </TabsContent>

        {/* CERTIFICATES -- approve renders the PDF; reject revokes */}
        <TabsContent value="certs" className="mt-4 space-y-3">
          <h3 className="font-semibold text-slate-700">Certificate Approvals</h3>
          {data.certificates.length === 0 ? <EmptyQueue what="certificates" /> : data.certificates.map((c) => (
            <ApprovalRow
              key={c.id}
              busy={busy === `cert:${c.id}`}
              rejectLabel="Revoke"
              onApprove={() => act(`cert:${c.id}`, () => api.post(`/ops/certificates/${c.id}/approve`))}
              onReject={() => {
                if (!window.confirm(`Revoke certificate ${c.certificate_number}?\n\nIt will fail public verification from then on.`)) return;
                act(`cert:${c.id}`, () => api.post(`/ops/certificates/${c.id}/revoke`));
              }}
            >
              <div>
                <p className="font-semibold text-slate-800">{c.certificate_number}</p>
                <p className="text-xs text-muted-foreground">Generated: {fmtDate(c.created_at)}</p>
              </div>
            </ApprovalRow>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ApprovalCenter;
