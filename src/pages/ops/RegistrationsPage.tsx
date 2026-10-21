import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Download, Eye, CheckCircle2, XCircle,
  MessageSquare, Calendar, Loader2, FileText, GraduationCap, Trash2,
} from "lucide-react";
import { API_BASE, api, fileUrl } from "@/lib/api";

/** The 9 lifecycle stages, in the order an intern moves through them. The
 *  server enforces the same sequence, so these keys must match it exactly. */
const PIPELINE_STAGES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "awaiting_registration_fee",
  "registration_fee_paid",
  "internship_started",
  "completed",
  "certificate_issued",
] as const;

/** Paused, not finished: offered from every stage and reversible, so they are
 *  listed under the divider rather than numbered among the stages. */
const HOLDING_STATUSES = ["on_hold", "not_responded"] as const;

const STATUS_INFO: Record<string, { label: string; style: string }> = {
  applied: { label: "Applied", style: "bg-blue-100 text-blue-700" },
  shortlisted: { label: "Shortlisted", style: "bg-violet-100 text-violet-700" },
  interview_scheduled: { label: "Interview Scheduled", style: "bg-indigo-100 text-indigo-700" },
  selected: { label: "Selected", style: "bg-emerald-100 text-emerald-700" },
  awaiting_registration_fee: { label: "Waiting for the Registration Fee", style: "bg-amber-100 text-amber-700" },
  registration_fee_paid: { label: "Registration Fee Paid", style: "bg-cyan-100 text-cyan-700" },
  internship_started: { label: "Internship Started", style: "bg-teal-100 text-teal-700" },
  completed: { label: "Completed", style: "bg-green-100 text-green-700" },
  certificate_issued: { label: "Certificate Issued", style: "bg-lime-100 text-lime-700" },
  // Holds and exits, not stages.
  on_hold: { label: "On Hold", style: "bg-orange-100 text-orange-700" },
  not_responded: { label: "Not Responded", style: "bg-stone-200 text-stone-700" },
  rejected: { label: "Rejected", style: "bg-rose-100 text-rose-700" },
  withdrawn: { label: "Withdrawn", style: "bg-slate-100 text-slate-500" },
  // Retired stage, kept only so an older record still reads properly.
  interview_completed: { label: "Interview Completed", style: "bg-purple-100 text-purple-700" },
};

/** The pipeline is strictly sequential, so "Approve" always means exactly one
 *  step forward. Derived from the stage order rather than hand-listed, so the
 *  two can never drift apart. */
const nextStage = (status: string): string | undefined => {
  const i = (PIPELINE_STAGES as readonly string[]).indexOf(status);
  return i >= 0 ? PIPELINE_STAGES[i + 1] : undefined;
};

/** 1-based position, for the "Stage 3 of 9" readout. */
const stageNumber = (status: string) => {
  const i = (PIPELINE_STAGES as readonly string[]).indexOf(status);
  return i >= 0 ? i + 1 : null;
};

const label = (status?: string | null) =>
  (status && STATUS_INFO[status]?.label) || status?.replace(/_/g, " ") || "-";

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "-");
const fmtDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString() : "-");

/** Just the clock time, e.g. "6:07 pm". Shown on its own line under the date so
 *  the Applied column does not get wider -- this table already scrolls. */
const fmtTime = (v?: string | null) =>
  v
    ? new Date(v)
        .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        .toLowerCase()
    : "";

type ModalKind = "view" | "reject" | "interview" | "remarks";

const RegistrationsPage = () => {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  /** Pipeline rules from the server, so this page never guesses which moves
   *  are legal and offers a button that can only 400. */
  const [transitions, setTransitions] = useState<Record<string, string[]>>({});
  const [terminal, setTerminal] = useState<string[]>([]);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const [modal, setModal] = useState<{ kind: ModalKind; app: any } | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /** Bumped whenever a stage change is abandoned. A cancelled <select> has
   *  already moved in the DOM, and if no state changed React would not
   *  re-render to put it back -- the key forces a fresh one. */
  const [selectNonce, setSelectNonce] = useState(0);
  const resetSelects = () => setSelectNonce((n) => n + 1);

  /** Dismiss without saving. Resets the dropdowns, since the stage change that
   *  opened this dialog never happened. */
  const closeModal = () => {
    setModal(null);
    resetSelects();
  };

  const fetchApplications = () => {
    setLoading(true);
    api.get<any>("/ops/applications?page_size=100")
      .then((res) => {
        setApplications(res.items || []);
        setLoading(false);
      })
      .catch(() => {
        setApplications([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchApplications();
    api.get<any>("/ops/applications/workflow")
      .then((w) => {
        setTransitions(w.transitions || {});
        setTerminal(w.terminal || []);
      })
      .catch(() => {
        // Non-fatal: without the rules every action stays clickable and the
        // server remains the authority on what is allowed.
      });
  }, []);

  const isTerminal = (status: string) => terminal.includes(status);

  /** Rejection is reachable from any non-terminal stage; anything else has to
   *  be in that stage's allowed list. */
  const canMoveTo = (from: string, to: string) => {
    if (isTerminal(from)) return false;
    if (to === "rejected") return true;
    const allowed = transitions[from];
    return allowed ? allowed.includes(to) : true;
  };

  const patch = (id: number, body: Record<string, unknown>) =>
    api.patch(`/ops/applications/${id}`, body);

  const runAction = (id: number, body: Record<string, unknown>, failure: string) => {
    setBusyId(id);
    return patch(id, body)
      .then(() => {
        fetchApplications();
        setModal(null);
        setDraft("");
      })
      .catch((err) => {
        alert(err.message || failure);
        // The change did not land, so put the dropdown back.
        resetSelects();
      })
      .finally(() => {
        setBusyId(null);
        setSubmitting(false);
      });
  };

  /** True when the move needs no confirmation and no override: either the very
   *  next stage, or one the server lists as legal from here. The second case
   *  covers 'selected' straight to 'registration_fee_paid', which is a normal
   *  path and not a skip -- waiting for the fee is only for those who owe it.
   *
   *  Coming out of a hold never qualifies. Every stage is legal from there, so
   *  the rule would wave through any choice, and re-entering the pipeline is
   *  exactly the moment to check which stage was meant. */
  const isSequential = (from: string, to: string) =>
    stageNumber(from) !== null &&
    (nextStage(from) === to || (transitions[from] || []).includes(to));

  /** Explains what an out-of-sequence move actually does, so nobody skips five
   *  stages without being told which five. */
  const describeJump = (from: string, to: string, who: string) => {
    const a = stageNumber(from);
    const b = stageNumber(to);

    if (a === null) {
      return `${who} is currently "${label(from)}". This reopens the application at ` +
        `stage ${b} (${label(to)}). Continue?`;
    }
    if (b === null) return `Move ${who} to "${label(to)}"?`;
    if (b < a) {
      return `This moves ${who} backwards, from stage ${a} (${label(from)}) to ` +
        `stage ${b} (${label(to)}). Continue?`;
    }
    const skipped = PIPELINE_STAGES.slice(a, b - 1).map((s) => label(s));
    return `This skips ${skipped.join(", ")}. ` +
      `${who} goes straight to stage ${b} (${label(to)}). Continue?`;
  };

  /** The status dropdown. Any stage can be picked; anything that is not the
   *  next one in sequence is confirmed first and sent with `force`. */
  const handleStageChange = (a: any, target: string) => {
    if (!target || target === a.status) return;

    const who = a.student?.full_name || a.student?.email || "this applicant";
    const sequential = isSequential(a.status, target);

    // Two stages have their own dialog: rejection captures a reason, and an
    // interview cannot be scheduled without a date.
    if (target === "rejected" || target === "interview_scheduled") {
      if (!sequential && !window.confirm(describeJump(a.status, target, who))) {
        resetSelects();
        return;
      }
      openModal(target === "rejected" ? "reject" : "interview", a);
      return;
    }

    if (!sequential && !window.confirm(describeJump(a.status, target, who))) {
      resetSelects();
      return;
    }

    runAction(a.id, { status: target, force: !sequential },
              "Could not change the stage.");
  };

  const handleApprove = (a: any) => {
    const next = nextStage(a.status);
    if (!next) return;

    // Stage 3 cannot be entered without a date, so advancing into it opens the
    // scheduler rather than setting a scheduled interview with no time.
    if (next === "interview_scheduled") {
      openModal("interview", a);
      return;
    }

    const who = a.student?.full_name || a.student?.email || "this applicant";
    if (!window.confirm(`Move ${who} from "${label(a.status)}" to "${label(next)}"?`)) return;
    runAction(a.id, { status: next }, "Could not update the application.");
  };

  const openModal = (kind: ModalKind, a: any) => {
    setModal({ kind, app: a });
    // Remarks open with whatever is already saved; the others start blank.
    setDraft(kind === "remarks" ? a.admin_notes || "" : "");
  };

  const submitModal = () => {
    if (!modal) return;
    const { kind, app } = modal;
    setSubmitting(true);

    // `force` is only permission to leave the sequence -- the server decides
    // whether the move actually needed it, so a normal rejection is not
    // recorded as an override.
    if (kind === "reject") {
      runAction(app.id, {
        status: "rejected",
        remarks: draft.trim() || null,
        force: !isSequential(app.status, "rejected"),
      }, "Could not reject the application.");
    } else if (kind === "interview") {
      // Sending the same status back is allowed, so re-booking the time of an
      // already-scheduled interview is not a forbidden transition.
      runAction(app.id, {
        status: "interview_scheduled",
        interview_at: draft,
        force: !isSequential(app.status, "interview_scheduled"),
      }, "Could not schedule the interview.");
    } else if (kind === "remarks") {
      // Same status on purpose: this saves remarks without moving the stage.
      runAction(app.id, { status: app.status, remarks: draft.trim() || null },
                "Could not save the remarks.");
    }
  };

  const handleDelete = (a: any) => {
    const who = a.student?.full_name || a.student?.email || "this applicant";
    if (!window.confirm(
      `Permanently delete ${who}'s registration for "${a.internship?.title}"?\n\n` +
      "This removes the registration, its tracking record and any weekly " +
      "reports. It cannot be undone.",
    )) return;

    setBusyId(a.id);
    // The server refuses once a certificate has been issued, and its message
    // explains why -- so surface it as-is.
    api.del(`/ops/applications/${a.id}`)
      .then(() => fetchApplications())
      .catch((err) => alert(err.message || "Could not delete the registration."))
      .finally(() => setBusyId(null));
  };

  const handleExport = () => {
    // A file download, so this bypasses the JSON client: the body is a blob and
    // the session cookie has to ride along for the ops permission check.
    setExporting(true);
    fetch(`${API_BASE}/ops/reports/applications/export?fmt=csv`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Your role does not have permission to export applications."
              : "Could not generate the export. Please try again.",
          );
        }
        const url = URL.createObjectURL(await res.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => alert(err.message || "Export failed"))
      .finally(() => setExporting(false));
  };

  const filtered = applications.filter((a) => {
    const studentName = a.student?.full_name || a.student?.email || "";
    const internshipTitle = a.internship?.title || "";
    const companyName = a.internship?.company || "";
    const term = search.toLowerCase();
    // Digits only on both sides, so "8610037036" matches "+91 86100 37036".
    const digits = search.replace(/\D/g, "");
    const phoneDigits = (a.student?.phone || "").replace(/\D/g, "");
    const matchSearch = studentName.toLowerCase().includes(term) ||
      internshipTitle.toLowerCase().includes(term) ||
      companyName.toLowerCase().includes(term) ||
      (a.student?.email || "").toLowerCase().includes(term) ||
      (!!digits && phoneDigits.includes(digits));
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const MODAL_COPY: Record<Exclude<ModalKind, "view">, { title: string; action: string }> = {
    reject: { title: "Reject application", action: "Reject application" },
    interview: { title: "Assign interview", action: "Schedule interview" },
    remarks: { title: "Remarks", action: "Save remarks" },
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Internship Tracking</h1>
          <p className="text-sm text-muted-foreground">
            {applications.length} interns tracked across {PIPELINE_STAGES.length} stages
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export
        </Button>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition border ${statusFilter === "all" ? "bg-accent text-white border-accent" : "bg-white text-slate-600 border-border hover:bg-slate-50"}`}
        >
          All ({applications.length})
        </button>
        {Object.entries(STATUS_INFO).map(([key, { label: text }]) => {
          const count = applications.filter((a) => a.status === key).length;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition border ${statusFilter === key ? "bg-accent text-white border-accent" : "bg-white text-slate-600 border-border hover:bg-slate-50"}`}
            >
              {text} ({count})
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by student, phone, internship, company..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_INFO).map(([key, { label: text }]) => (
                <option key={key} value={key}>{text}</option>
              ))}
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
              <div className="text-center py-20 text-muted-foreground">
                No internship registrations found.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="p-4 text-left font-semibold text-slate-600">Student</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Phone</th>
                    <th className="p-4 text-left font-semibold text-slate-600">College / Dept</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Internship</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Company</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Applied</th>
                    <th className="p-4 text-left font-semibold text-slate-600">Status</th>
                    {/* Pinned right: with eight columns the table scrolls
                        sideways, and the actions were being clipped off the
                        edge -- the Delete button was unreachable. */}
                    <th className="sticky right-0 z-10 bg-slate-50 p-4 text-left font-semibold text-slate-600 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.10)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const statusInfo = STATUS_INFO[a.status] || { label: a.status, style: "bg-slate-100 text-slate-700" };
                    const busy = busyId === a.id;
                    const next = nextStage(a.status);
                    const canApprove = !!next && canMoveTo(a.status, next);
                    const canReject = canMoveTo(a.status, "rejected");
                    const canInterview =
                      a.status === "interview_scheduled" ||
                      canMoveTo(a.status, "interview_scheduled");
                    return (
                      <tr key={a.id} className="group border-b last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                              {(a.student?.full_name || a.student?.email || "U")[0].toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium">{a.student?.full_name || "Unknown"}</span>
                              <span className="text-xs text-muted-foreground">{a.student?.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-sm">
                          {a.student?.phone ? (
                            <a
                              href={`tel:${a.student.phone.replace(/\s+/g, "")}`}
                              className="whitespace-nowrap hover:text-accent hover:underline"
                            >
                              {a.student.phone}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          <p className="text-sm">{a.student?.college_name || "-"}</p>
                          <p className="text-xs text-muted-foreground">{a.student?.course || "-"}</p>
                        </td>
                        <td className="p-4 font-medium">{a.internship?.title || "-"}</td>
                        <td className="p-4 text-sm">{a.internship?.company || "-"}</td>
                        <td className="p-4 text-xs text-muted-foreground">
                          <div className="whitespace-nowrap">{fmtDate(a.applied_at)}</div>
                          {a.applied_at && (
                            <div className="whitespace-nowrap">{fmtTime(a.applied_at)}</div>
                          )}
                        </td>
                        <td className="p-4">
                          <select
                            // Keyed so a cancelled change snaps back to the
                            // stage the record is actually on.
                            key={`${a.id}-${a.status}-${selectNonce}`}
                            value={a.status}
                            disabled={busy}
                            onChange={(e) => handleStageChange(a, e.target.value)}
                            title="Change stage"
                            className={`w-full min-w-40 cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ring-offset-1 focus:ring-2 focus:ring-accent disabled:opacity-50 ${statusInfo.style}`}
                          >
                            {PIPELINE_STAGES.map((s, i) => (
                              <option key={s} value={s}>
                                {i + 1}. {STATUS_INFO[s].label}
                              </option>
                            ))}
                            <option disabled>──────────</option>
                            {HOLDING_STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_INFO[s].label}</option>
                            ))}
                            <option value="rejected">{STATUS_INFO.rejected.label}</option>
                            {/* Only reachable by the student, so it is offered
                                purely so the dropdown can display it. */}
                            {a.status === "withdrawn" && (
                              <option value="withdrawn">{STATUS_INFO.withdrawn.label}</option>
                            )}
                            {/* Same for a record still sitting on the retired
                                'interview completed' stage: without this the
                                dropdown would render blank. */}
                            {a.status === "interview_completed" && (
                              <option value="interview_completed">
                                {STATUS_INFO.interview_completed.label}
                              </option>
                            )}
                          </select>
                          {stageNumber(a.status) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Stage {stageNumber(a.status)} of {PIPELINE_STAGES.length}
                            </p>
                          )}
                          {a.interview_at && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {fmtDateTime(a.interview_at)}
                            </p>
                          )}
                        </td>
                        {/* Sticky, so every action stays reachable however far
                            the table is scrolled. The background has to be
                            opaque or the columns underneath show through, and it
                            tracks the row's hover state via `group`. */}
                        <td className="sticky right-0 z-10 bg-white p-4 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.10)] transition-colors group-hover:bg-slate-50">
                          <div className="flex flex-nowrap items-center gap-1">
                            <button
                              onClick={() => openModal("view", a)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleApprove(a)}
                              disabled={busy || !canApprove}
                              className="rounded-md p-1.5 text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30 disabled:hover:bg-transparent"
                              title={
                                canApprove
                                  ? `Approve — move to ${label(next)}`
                                  : `Cannot approve from "${label(a.status)}"`
                              }
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => openModal("reject", a)}
                              disabled={busy || !canReject}
                              className="rounded-md p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                              title={canReject ? "Reject" : `Already ${label(a.status)}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openModal("interview", a)}
                              disabled={busy || !canInterview}
                              className="rounded-md p-1.5 text-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:hover:bg-transparent"
                              title={
                                canInterview
                                  ? "Assign interview"
                                  : `Shortlist before scheduling an interview`
                              }
                            >
                              <Calendar className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openModal("remarks", a)}
                              disabled={busy}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                              title="Remarks"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(a)}
                              disabled={busy}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                              title="Delete registration"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Application detail */}
      {modal?.kind === "view" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex-row items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-xl font-bold text-accent">
                  {(modal.app.student?.full_name || modal.app.student?.email || "U")[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{modal.app.student?.full_name || "Unknown"}</h2>
                  <p className="text-sm text-muted-foreground">{modal.app.student?.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {modal.app.student?.phone || "No phone number"}
                  </p>
                  <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_INFO[modal.app.status]?.style || "bg-slate-100"}`}>
                    {label(modal.app.status)}
                    {stageNumber(modal.app.status) &&
                      ` — stage ${stageNumber(modal.app.status)} of ${PIPELINE_STAGES.length}`}
                  </span>
                </div>
              </div>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4">
                  <h4 className="mb-3 text-sm font-semibold">Applicant</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-accent" />
                      <span>{modal.app.student?.college_name || "Not set"}</span>
                    </div>
                    <p><span className="font-medium">Course:</span> {modal.app.student?.course || "—"}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <h4 className="mb-3 text-sm font-semibold">Internship</h4>
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">{modal.app.internship?.title || "—"}</p>
                    <p>{modal.app.internship?.company || "—"}</p>
                    <p><span className="font-medium">Department:</span> {modal.app.internship?.department || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <p><span className="font-medium">Applied:</span> {fmtDateTime(modal.app.applied_at)}</p>
                <p><span className="font-medium">Last updated:</span> {fmtDateTime(modal.app.updated_at)}</p>
                <p><span className="font-medium">Interview:</span> {fmtDateTime(modal.app.interview_at)}</p>
                <p>
                  <span className="font-medium">Resume:</span>{" "}
                  {modal.app.resume_url ? (
                    <a
                      // Uploaded resumes are stored as an API path; older ones
                      // are absolute links. fileUrl handles both.
                      href={fileUrl(modal.app.resume_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" /> Open
                    </a>
                  ) : "Not uploaded"}
                </p>
              </div>

              <div>
                <h4 className="mb-1 text-sm font-semibold">Cover note</h4>
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  {modal.app.cover_note || "No cover note was submitted."}
                </p>
              </div>

              <div>
                <h4 className="mb-1 text-sm font-semibold">Internal remarks</h4>
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  {modal.app.admin_notes || "No remarks yet."}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => openModal("remarks", modal.app)}>
                  <MessageSquare className="mr-2 h-4 w-4" /> Edit remarks
                </Button>
                <Button size="sm" onClick={closeModal}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reject / interview / remarks */}
      {modal && modal.kind !== "view" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">{MODAL_COPY[modal.kind].title}</h2>
                <p className="text-sm text-muted-foreground">
                  {modal.app.student?.full_name || modal.app.student?.email} — {modal.app.internship?.title}
                </p>
              </div>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">✕</button>
            </CardHeader>
            <CardContent className="space-y-4">
              {modal.kind === "interview" ? (
                <div>
                  <Label htmlFor="interview_at">Interview date and time</Label>
                  <Input
                    id="interview_at"
                    type="datetime-local"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    The student is notified that their interview has been scheduled.
                  </p>
                </div>
              ) : (
                <div>
                  <Label htmlFor="note">
                    {modal.kind === "reject" ? "Reason (optional)" : "Remarks"}
                  </Label>
                  <Textarea
                    id="note"
                    rows={4}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      modal.kind === "reject"
                        ? "Why is this application being rejected?"
                        : "Internal notes about this applicant"
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {modal.kind === "reject"
                      ? "Saved as an internal remark. Rejecting cannot be undone."
                      : "Internal only — the student never sees this, and their stage does not change."}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={closeModal} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant={modal.kind === "reject" ? "destructive" : "default"}
                  onClick={submitModal}
                  disabled={submitting || (modal.kind === "interview" && !draft)}
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {MODAL_COPY[modal.kind].action}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default RegistrationsPage;
