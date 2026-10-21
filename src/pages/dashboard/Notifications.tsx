import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, type Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

const Notifications = () => {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api.get<Notification[]>("/student/notifications"));
    } catch {
      setError("Could not load your notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await api.post("/student/notifications/read");
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    } catch {
      /* non-critical */
    } finally {
      setMarking(false);
    }
  };

  const unread = items.filter((n) => !n.read_at).length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          Notifications
          {unread > 0 && (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              {unread} new
            </span>
          )}
        </h2>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={marking}>
            Mark all as read
          </Button>
        )}
      </div>

      {error ? (
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
            <BellOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-2 text-lg font-bold">No notifications</h3>
            <p className="text-muted-foreground">
              Updates about your applications will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const body = (
              <CardContent className="p-5">
                <div className="flex gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      n.read_at ? "bg-secondary" : "bg-accent/10",
                    )}
                  >
                    <Bell
                      className={cn(
                        "h-4 w-4",
                        n.read_at ? "text-muted-foreground" : "text-accent",
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className={cn("font-bold", !n.read_at && "text-accent")}>
                        {n.title}
                      </h3>
                      {!n.read_at && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(n.created_at)}
                    </p>
                  </div>
                </div>
              </CardContent>
            );

            return n.link ? (
              <Link key={n.id} to={n.link} className="block">
                <Card className="transition-colors hover:border-accent/40">{body}</Card>
              </Link>
            ) : (
              <Card key={n.id}>{body}</Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Notifications;
