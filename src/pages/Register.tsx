import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BadgeCheck, Loader2 } from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import ResumeUploadField from "@/components/ResumeUploadField";
import { needsOnboarding, useAuth } from "@/contexts/AuthContext";
import { api, API_BASE, ApiError } from "@/lib/api";
import type { MetaOptions } from "@/lib/types";

const PERKS = [
  "Free OOS membership",
  "Apply to verified internships",
  "Track every application",
  "Save opportunities for later",
];

/** Only same-site relative paths, so `?next=` can't bounce to another domain. */
const safeNext = (raw: string | null | undefined) =>
  raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

const Register = () => {
  const { user, loading, register, completeProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Google signs the student in before we have asked for anything, so the same
  // form runs in two modes: a full registration, or finishing that signup.
  const finishingSignup = needsOnboarding(user);

  const [values, setValues] = useState({
    full_name: "",
    email: "",
    phone: "",
    college_name: "",
    course: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /** Course options come from the server so this list cannot drift from the
   *  one the profile page offers, or from what the API will accept. */
  const [courses, setCourses] = useState<string[]>([]);
  /** Finishing a Google signup: the account exists, so the upload happens as
   *  soon as the file is chosen and this holds the stored path. */
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  /** Plain registration: no account yet, so the file is held here and sent
   *  once registering has created one. */
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  useEffect(() => {
    api.get<MetaOptions>("/meta/options")
      .then((o) => setCourses(o.courses || []))
      // Non-fatal: the field falls back to an empty list and the student can
      // still finish, since the server validates the value anyway.
      .catch(() => setCourses([]));
  }, []);

  // Prefill what Google told us. This has to be an effect, not initial state:
  // the session check resolves after the first render.
  useEffect(() => {
    if (!user) {
      // Signed out from the details page -- drop the Google values so the plain
      // registration form doesn't start with someone else's name and email.
      setValues((prev) => ({ ...prev, full_name: "", email: "" }));
      return;
    }
    setValues((prev) => ({
      ...prev,
      // `prev ||` so a re-render mid-typing doesn't overwrite an edit.
      full_name: prev.full_name || user.name || "",
      email: user.email,
    }));
  }, [user]);

  const destination = safeNext(
    searchParams.get("next") ?? (location.state as { from?: string } | null)?.from,
  );

  // A signed-in student who has finished signing up has no business here.
  if (!loading && user && !finishingSignup) return <Navigate to={destination} replace />;

  const set = (k: keyof typeof values, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  /** Plain registration only -- the Google flow no longer asks for a password. */
  const passwordProblem = () => {
    if (values.password.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(values.password) || !/\d/.test(values.password))
      return "Password must contain at least one letter and one number.";
    if (values.password !== values.confirm) return "Passwords do not match.";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!values.full_name.trim()) return setError("Please enter your full name.");

    if (finishingSignup) {
      if (!values.phone.trim()) return setError("Please enter your phone number.");
      if (!values.college_name.trim())
        return setError("Please enter your college or university.");
      if (!values.course) return setError("Please select your course.");

      setSubmitting(true);
      try {
        // No password: Google already signs them in, so this form does not
        // ask for one.
        await completeProfile({
          full_name: values.full_name.trim(),
          phone: values.phone.trim(),
          college_name: values.college_name.trim(),
          course: values.course,
        });
        navigate(destination, { replace: true });
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not save your details. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      return setError("Please enter a valid email address.");
    const problem = passwordProblem();
    if (problem) return setError(problem);

    setSubmitting(true);
    try {
      await register({
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        password: values.password,
        phone: values.phone.trim() || undefined,
        college_name: values.college_name.trim() || undefined,
        course: values.course || undefined,
      });

      // The resume can only be sent now: it needs the session cookie that
      // registering has just set. A failure here is not worth losing a working
      // account over, so it is reported rather than thrown -- the student can
      // add the file from their profile.
      if (resumeFile) {
        const form = new FormData();
        form.append("file", resumeFile);
        const res = await fetch(`${API_BASE}/student/resume`, {
          method: "POST", body: form, credentials: "include",
        });
        if (!res.ok) {
          setSubmitting(false);
          setResumeFile(null);
          return setError(
            "Your account was created, but the resume did not upload. " +
            "You can add it from My Profile.",
          );
        }
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 bg-gradient-subtle py-14">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-lg">
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-3xl font-bold">
                {finishingSignup ? "Just a few more details" : "Become an OOS Member"}
              </h1>
              <p className="text-muted-foreground">
                {finishingSignup
                  ? "You're signed in with Google. Fill these in to finish creating your account."
                  : "Free registration. Start applying for verified internships today."}
              </p>
            </div>

            {!finishingSignup && (
              <div className="mb-6 grid grid-cols-2 gap-2">
                {PERKS.map((p) => (
                  <div key={p} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BadgeCheck className="h-4 w-4 shrink-0 text-accent" />
                    {p}
                  </div>
                ))}
              </div>
            )}

            <Card>
              <CardContent className="p-8">
                {!finishingSignup && <GoogleSignInButton label="Sign up with Google" />}

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div>
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      value={values.full_name}
                      onChange={(e) => set("full_name", e.target.value)}
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={values.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="you@example.com"
                      // The address comes from Google and identifies the
                      // account that already exists -- not editable here.
                      readOnly={finishingSignup}
                      disabled={finishingSignup}
                    />
                    {finishingSignup && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        From your Google account.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="phone">
                      {finishingSignup ? "Phone Number *" : "Phone Number"}
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={values.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div>
                    <Label htmlFor="college_name">
                      {finishingSignup ? "College / University *" : "College / University"}
                    </Label>
                    <Input
                      id="college_name"
                      value={values.college_name}
                      onChange={(e) => set("college_name", e.target.value)}
                      placeholder="Your institution"
                    />
                  </div>

                  <div>
                    {/* Required only in the Google flow, matching phone and
                        college: that form asks for a complete set, this one
                        lets people get started and fill the rest in later. */}
                    <Label htmlFor="course">
                      {finishingSignup ? "Course *" : "Course"}
                    </Label>
                    <Select
                      value={values.course}
                      onValueChange={(v) => set("course", v)}
                    >
                      <SelectTrigger id="course">
                        <SelectValue placeholder="Select your course" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Two modes: finishing a Google signup uploads immediately,
                      since the account is already there. Plain registration
                      only holds the file -- handleSubmit sends it once the
                      account has been created. */}
                  {finishingSignup ? (
                    <ResumeUploadField
                      value={resumeUrl}
                      onUploaded={(p) => {
                        setResumeUrl(p.resume_url);
                        setError("");
                      }}
                    />
                  ) : (
                    <ResumeUploadField
                      file={resumeFile}
                      onSelectFile={(f) => {
                        setResumeFile(f);
                        setError("");
                      }}
                    />
                  )}

                  {/* Password only on a plain registration: a Google account
                      can already sign in, so asking for one there is a field
                      with nothing behind it. */}
                  {!finishingSignup && (
                    <>
                      <div>
                        <Label htmlFor="password">Password *</Label>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="new-password"
                          value={values.password}
                          onChange={(e) => set("password", e.target.value)}
                          placeholder="At least 8 characters"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Minimum 8 characters, with at least one letter and one number.
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="confirm">Confirm Password *</Label>
                        <Input
                          id="confirm"
                          type="password"
                          autoComplete="new-password"
                          value={values.confirm}
                          onChange={(e) => set("confirm", e.target.value)}
                          placeholder="Re-enter your password"
                        />
                      </div>
                    </>
                  )}

                  {error && (
                    <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    variant="gradient"
                    size="lg"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      "Create Free Account"
                    )}
                  </Button>
                </form>

                {finishingSignup ? (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Signed in as {user?.email}.{" "}
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="font-medium text-accent hover:underline"
                    >
                      Use a different account
                    </button>
                  </p>
                ) : (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link to="/login" className="font-medium text-accent hover:underline">
                      Sign in
                    </Link>
                  </p>
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

export default Register;
