import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";

const Login = () => {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [searchParams] = useSearchParams();

  const fromState = (location.state as { from?: string } | null)?.from;
  const defaultPath = user?.role === "admin" || user?.role === "ops" ? "/ops" : "/dashboard";

  // Google redirects back here with ?error=... when sign-in fails or is cancelled.
  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  if (!loading && user) return <Navigate to={fromState || defaultPath} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      const redirectPath = fromState || (u.role === "admin" || u.role === "ops" ? "/ops" : "/dashboard");
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center bg-gradient-subtle py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-md">
            <Card>
              <CardContent className="p-8">
                <h1 className="mb-2 text-3xl font-bold">Welcome back</h1>
                <p className="mb-6 text-muted-foreground">
                  Sign in to your OOS account to continue.
                </p>

                <GoogleSignInButton next={fromState || "/dashboard"} label="Sign in with Google" />

                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                    />
                  </div>

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
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <Link to="/register" className="font-medium text-accent hover:underline">
                    Create one
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Login;
