import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ONBOARDING_PATH, needsOnboarding, useAuth, type UserRole } from "@/contexts/AuthContext";

// ⚠️ DEV ONLY — set false before deploying to production
const DEV_BYPASS_AUTH = false;

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Omit to allow any signed-in user. */
  allow?: UserRole[];
}

const ProtectedRoute = ({ children, allow }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Dev mode: skip auth so you can preview all pages without a backend session
  if (DEV_BYPASS_AUTH) {
    return <>{children}</>;
  }

  // Wait for the session check; redirecting during it would sign out a
  // logged-in user on every refresh.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // A Google signup only has a name and an email so far. Finish the details
  // form before the dashboard, otherwise typing the URL skips half of signup.
  if (needsOnboarding(user)) {
    return <Navigate to={ONBOARDING_PATH} state={{ from: location.pathname }} replace />;
  }

  if (allow && !allow.includes(user.role)) {
    // If an admin/ops tries to hit a student-only route, send them to their portal
    if (user.role === "admin" || user.role === "ops") {
      return <Navigate to="/ops" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
