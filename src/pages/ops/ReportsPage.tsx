import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Loader2, AlertTriangle } from "lucide-react";
import { API_BASE, api } from "@/lib/api";

interface ReportMeta { key: string; name: string }

interface ReportResult {
  report: string;
  name: string;
  date_from: string;
  date_to: string;
  columns: string[];
  rows: (string | number | null)[][];
  row_count: number;
  truncated: boolean;
}

/** Rows come back as positional arrays matching `columns`, so a cell is only
 *  ever rendered against the header at the same index. */
const cell = (v: string | number | null) => (v === null || v === "" ? "—" : String(v));

/** Four sidebar links land here, plus /ops/placements. Each preselects its own
 *  report instead of always opening the first one in the list. */
const REPORT_FOR_PATH: Record<string, string> = {
  "/ops/reports/students": "students",
  "/ops/reports/companies": "companies",
  "/ops/reports/colleges": "colleges",
  "/ops/reports/internships": "applications",
  "/ops/placements": "placements",
};

const ReportsPage = () => {
  const location = useLocation();
  const routeReport = REPORT_FOR_PATH[location.pathname];

  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [reportKey, setReportKey] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [catalogueError, setCatalogueError] = useState("");

  useEffect(() => {
    api.get<{ reports?: ReportMeta[] }>("/ops/reports")
      .then((res) => {
        const list = res.reports || [];
        setReports(list);
        // Honour the route's report if the server actually offers it.
        const wanted = list.find((r) => r.key === routeReport)?.key;
        setReportKey(wanted || list[0]?.key || "");
      })
      .catch((err) => setCatalogueError(err.message || "Could not load the report list."));
  }, [routeReport]);

  const query = () => {
    const params = new URLSearchParams();
    if (fromDate) params.set("date_from", fromDate);
    if (toDate) params.set("date_to", toDate);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const runReport = () => {
    if (!reportKey) return;
    setRunning(true);
    setError("");
    api.get<ReportResult>(`/ops/reports/${reportKey}${query()}`)
      .then((res) => {
        setResult(res);
        setRunning(false);
      })
      .catch((err) => {
        setError(err.message || "Could not run that report.");
        setResult(null);
        setRunning(false);
      });
  };

  // Export is a separate server permission from view, so a 403 here is normal
  // for some roles -- the link simply fails rather than the page breaking.
  const exportUrl = (fmt: "csv" | "xlsx") => {
    const params = new URLSearchParams({ fmt });
    if (fromDate) params.set("date_from", fromDate);
    if (toDate) params.set("date_to", toDate);
    return `${API_BASE}/ops/reports/${reportKey}/export?${params.toString()}`;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Run a report over a date range, then download it as CSV or Excel
          </p>
        </div>
      </div>

      {catalogueError && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{catalogueError}</div>
      )}

      {/* Report builder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Build a Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Report</label>
              <select
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                value={reportKey}
                onChange={(e) => setReportKey(e.target.value)}
              >
                {reports.length === 0 && <option value="">Loading…</option>}
                {reports.map((r) => (
                  <option key={r.key} value={r.key}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">From</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">To</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full bg-accent hover:bg-accent/90"
                onClick={runReport}
                disabled={running || !reportKey}
              >
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Run Report
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Leave the dates blank for the last 12 months.
          </p>
        </CardContent>
      </Card>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* Result */}
      {result && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{result.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {result.date_from} to {result.date_to} · {result.row_count} rows
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={exportUrl("csv")}><Download className="mr-2 h-4 w-4" />CSV</a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={exportUrl("xlsx")}><Download className="mr-2 h-4 w-4" />Excel</a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {result.truncated && (
              <div className="flex items-start gap-2 border-b bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This report hit the row cap, so it is not the complete set. Narrow the
                  date range, or download the export.
                </span>
              </div>
            )}
            {result.rows.length === 0 ? (
              <p className="p-12 text-center text-sm text-muted-foreground">
                No rows for this report in that date range.
              </p>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b bg-slate-50">
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c} className="whitespace-nowrap p-3 text-left font-semibold text-slate-600">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                        {result.columns.map((_, j) => (
                          <td key={j} className="whitespace-nowrap p-3 text-slate-700">
                            {cell(row[j])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!result && !error && (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Pick a report and a date range, then choose Run Report.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReportsPage;
