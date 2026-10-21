import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import InternshipCardItem from "@/components/InternshipCard";
import { Bookmark, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { InternshipCard } from "@/lib/types";

const Saved = () => {
  const [items, setItems] = useState<InternshipCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api.get<InternshipCard[]>("/student/saved"));
    } catch {
      setError("Could not load your saved internships.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSave = async (id: number) => {
    setBusyId(id);
    try {
      await api.post(`/student/saved/${id}`);
      // Unsaving from this page should remove the card immediately.
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      /* non-critical */
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="mb-4 text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={load}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <Bookmark className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="mb-2 text-lg font-bold">Nothing saved yet</h3>
          <p className="mb-6 text-muted-foreground">
            Save internships you're interested in to find them again quickly.
          </p>
          <Link to="/internships">
            <Button variant="gradient">Browse Internships</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((i) => (
        <InternshipCardItem
          key={i.id}
          internship={i}
          onToggleSave={toggleSave}
          saving={busyId === i.id}
        />
      ))}
    </div>
  );
};

export default Saved;
