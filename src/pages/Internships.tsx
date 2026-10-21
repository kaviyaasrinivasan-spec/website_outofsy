import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import InternshipCardItem from "@/components/InternshipCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Briefcase, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { InternshipListResponse, InternshipCard } from "@/lib/types";

const MODES = ["All", "Remote", "Hybrid", "On-site"];
const PAGE_SIZE = 12;

const Internships = () => {
  const { user } = useAuth();
  const isStudent = user?.role === "student";

  const [items, setItems] = useState<InternshipCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [mode, setMode] = useState("All");
  const [savingId, setSavingId] = useState<number | null>(null);

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (debounced.trim()) params.set("search", debounced.trim());
      if (mode !== "All") params.set("work_mode", mode);

      const data = await api.get<InternshipListResponse>(`/internships?${params}`);
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError("We couldn't load internships right now. Please try again shortly.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debounced, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSave = async (id: number) => {
    setSavingId(id);
    try {
      await api.post(`/student/saved/${id}`);
      // Flip locally rather than refetching the whole page.
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, is_saved: !i.is_saved } : i)),
      );
    } catch {
      /* non-critical: leave the icon as-is */
    } finally {
      setSavingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="bg-gradient-subtle py-14">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="mb-4">Active Internship Programs</h1>
              <p className="mb-8 text-xl text-muted-foreground">
                Verified opportunities from companies hiring right now.
              </p>
              <div className="relative mx-auto max-w-xl">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by role, skill or company..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border py-6">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-3">
              {MODES.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={mode === m ? "default" : "outline"}
                  onClick={() => {
                    setMode(m);
                    setPage(1);
                  }}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="py-14">
          <div className="container mx-auto px-4">
            {loading ? (
              <div className="flex justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              </div>
            ) : error ? (
              <div className="py-20 text-center">
                <p className="mb-4 text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={load}>
                  Try Again
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="py-20 text-center">
                <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
                <h3 className="mb-2 text-xl font-bold">No internships found</h3>
                <p className="text-muted-foreground">
                  {debounced || mode !== "All"
                    ? "Try adjusting your search or filters."
                    : "New opportunities are added regularly — check back soon."}
                </p>
              </div>
            ) : (
              <>
                <p className="mb-6 text-sm text-muted-foreground">
                  {total} {total === 1 ? "opportunity" : "opportunities"} available
                </p>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((internship) => (
                    <InternshipCardItem
                      key={internship.id}
                      internship={internship}
                      onToggleSave={isStudent ? toggleSave : undefined}
                      saving={savingId === internship.id}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-10 flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Internships;
