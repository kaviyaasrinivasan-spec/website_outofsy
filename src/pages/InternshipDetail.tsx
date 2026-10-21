import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Bookmark, BookmarkCheck, Building2, CalendarClock, CheckCircle2,
  ClipboardList, Clock, Loader2, MapPin, Users, Wallet,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate, isExpired, type InternshipDetail as Detail } from "@/lib/types";

const InternshipDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isStudent = user?.role === "student";

  const [internship, setInternship] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [coverNote, setCoverNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setInternship(await api.get<Detail>(`/internships/${id}`));
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError("Could not load this internship.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = async () => {
    if (!internship) return;
    setError("");
    setSubmitting(true);
    try {
      await api.post("/student/applications", {
        internship_id: internship.id,
        cover_note: coverNote.trim() || undefined,
      });
      setApplied(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit your application.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSave = async () => {
    if (!internship) return;
    setSaving(true);
    try {
      await api.post(`/student/saved/${internship.id}`);
      setInternship({ ...internship, is_saved: !internship.is_saved });
    } catch {
      /* non-critical */
    } finally {
      setSaving(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !internship) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1 items-center justify-center py-20">
          <div className="text-center">
            <h1 className="mb-3 text-2xl font-bold">Internship not available</h1>
            <p className="mb-6 text-muted-foreground">
              This opportunity may have closed or been removed.
            </p>
            <Link to="/internships">
              <Button variant="gradient">Browse Internships</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const expired = isExpired(internship.last_date_to_apply);
  const alreadyApplied = internship.has_applied || applied;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 bg-gradient-subtle py-10">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            <Link
              to="/internships"
              className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to internships
            </Link>

            <Card className="mb-6">
              <CardContent className="p-8">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {internship.company?.logo_url ? (
                      <img
                        src={internship.company.logo_url}
                        alt={internship.company.name}
                        className="h-16 w-16 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent/10">
                        <Building2 className="h-7 w-7 text-accent" />
                      </div>
                    )}
                    <div>
                      <h1 className="mb-1 text-3xl font-bold">{internship.title}</h1>
                      <p className="text-lg text-muted-foreground">
                        {internship.company?.name}
                        {internship.company?.industry && ` · ${internship.company.industry}`}
                      </p>
                    </div>
                  </div>

                  {isStudent && (
                    <Button variant="outline" size="sm" onClick={toggleSave} disabled={saving}>
                      {internship.is_saved ? (
                        <>
                          <BookmarkCheck className="mr-2 h-4 w-4" /> Saved
                        </>
                      ) : (
                        <>
                          <Bookmark className="mr-2 h-4 w-4" /> Save
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { icon: Clock, label: "Duration", value: internship.duration },
                    { icon: MapPin, label: "Mode", value: internship.work_mode },
                    { icon: Wallet, label: "Stipend", value: internship.stipend },
                    { icon: Users, label: "Openings", value: internship.openings?.toString() },
                  ]
                    .filter((f) => f.value)
                    .map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-center gap-3">
                        <Icon className="h-5 w-5 shrink-0 text-accent" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="truncate font-medium">{value}</p>
                        </div>
                      </div>
                    ))}
                </div>

                {internship.last_date_to_apply && (
                  <p className="mt-5 flex items-center gap-2 text-sm">
                    <CalendarClock className="h-4 w-4 text-accent" />
                    <span className={expired ? "text-destructive" : "text-muted-foreground"}>
                      {expired ? "Applications closed on " : "Apply by "}
                      <strong>{formatDate(internship.last_date_to_apply)}</strong>
                    </span>
                  </p>
                )}

                {internship.description && (
                  <div className="mt-7">
                    <h2 className="mb-3 text-xl font-bold">About this internship</h2>
                    <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                      {internship.description}
                    </p>
                  </div>
                )}

                {internship.responsibilities && (
                  <div className="mt-7">
                    <h2 className="mb-3 text-xl font-bold">What you'll do</h2>
                    <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                      {internship.responsibilities}
                    </p>
                  </div>
                )}

                {internship.required_skills.length > 0 && (
                  <div className="mt-7">
                    <h2 className="mb-3 text-xl font-bold">Skills required</h2>
                    <div className="flex flex-wrap gap-2">
                      {internship.required_skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Apply panel -- state depends on auth and eligibility */}
            <Card>
              <CardContent className="p-8">
                {applied ? (
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
                      <CheckCircle2 className="h-8 w-8 text-accent" />
                    </div>
                    <h2 className="mb-2 text-2xl font-bold">Application submitted</h2>
                    <p className="mb-6 text-muted-foreground">
                      We've received your application. Track its progress from your dashboard.
                    </p>
                    <Button variant="gradient" onClick={() => navigate("/dashboard/applications")}>
                      View My Applications
                    </Button>
                  </div>
                ) : !user ? (
                  <div className="text-center">
                    <h2 className="mb-2 text-xl font-bold">Ready to apply?</h2>
                    <p className="mb-6 text-muted-foreground">
                      Create a free OOS account to apply for this internship and track your
                      application.
                    </p>
                    <div className="flex flex-col justify-center gap-3 sm:flex-row">
                      <Link to="/register">
                        <Button variant="gradient" size="lg" className="w-full sm:w-auto">
                          Register as Student
                        </Button>
                      </Link>
                      <Link to="/login">
                        <Button variant="outline" size="lg" className="w-full sm:w-auto">
                          Sign In
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : !isStudent ? (
                  <p className="text-center text-muted-foreground">
                    Only student accounts can apply for internships.
                  </p>
                ) : internship.has_applied ? (
                  <div className="text-center">
                    <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-accent" />
                    <h2 className="mb-2 text-xl font-bold">You've already applied</h2>
                    <Link to="/dashboard/applications">
                      <Button variant="outline">Track Application</Button>
                    </Link>
                  </div>
                ) : internship.has_active_application ? (
                  // One internship at a time: explained here rather than left
                  // for the button to fail on.
                  <div className="text-center">
                    <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                    <h2 className="mb-2 text-xl font-bold">
                      You already have an application in progress
                    </h2>
                    <p className="mb-6 text-muted-foreground">
                      You can take on one internship at a time. Once your current
                      one is complete, you'll be able to apply for this.
                    </p>
                    <Link to="/dashboard/applications">
                      <Button variant="outline">View My Application</Button>
                    </Link>
                  </div>
                ) : expired ? (
                  <p className="text-center text-muted-foreground">
                    The deadline for this internship has passed.
                  </p>
                ) : (
                  <>
                    <h2 className="mb-4 text-xl font-bold">Apply for this internship</h2>
                    <div className="mb-4">
                      <Label htmlFor="cover_note">Why are you a good fit? (optional)</Label>
                      <Textarea
                        id="cover_note"
                        rows={5}
                        maxLength={2000}
                        value={coverNote}
                        onChange={(e) => setCoverNote(e.target.value)}
                        placeholder="Tell the company about your interest, relevant projects or skills..."
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {coverNote.length}/2000
                      </p>
                    </div>

                    {error && (
                      <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </p>
                    )}

                    <Button
                      variant="gradient"
                      size="lg"
                      className="w-full"
                      onClick={handleApply}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        "Apply Now"
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default InternshipDetailPage;
