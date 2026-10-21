import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, ClipboardList, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  formatDate, STATUS_CLASS, STATUS_LABEL, type Application,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Scope = "all" | "active" | "history";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "history", label: "History" },
];

const Applications = () => {
  const [scope, setScope] = useState<Scope>("all");
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api.get<Application[]>(`/student/applications?scope=${scope}`));
    } catch {
      setError("Could not load your applications.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  // Students no longer withdraw their own applications: the team handles any
  // change of mind, so there is one place where the pipeline moves.

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <Button
            key={s.key}
            size="sm"
            variant={scope === s.key ? "default" : "outline"}
            onClick={() => setScope(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="mb-4 text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={load}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <ClipboardList className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-2 text-lg font-bold">No applications yet</h3>
            <p className="mb-6 text-muted-foreground">
              {scope === "history"
                ? "Completed applications will appear here."
                : "Apply to an internship and track its progress here."}
            </p>
            <Link to="/internships">
              <Button variant="gradient">Browse Internships</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    {a.internship?.company?.logo_url ? (
                      <img
                        src={a.internship.company.logo_url}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <Building2 className="h-5 w-5 text-accent" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="truncate font-bold">
                        {a.internship?.title ?? "Internship"}
                      </h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {a.internship?.company?.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Applied {formatDate(a.applied_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        STATUS_CLASS[a.status],
                      )}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                    <div className="flex gap-2">
                      {a.internship && (
                        <Link to={`/internships/${a.internship.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {a.cover_note && (
                  <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Your note: </span>
                    {a.cover_note}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Applications;
