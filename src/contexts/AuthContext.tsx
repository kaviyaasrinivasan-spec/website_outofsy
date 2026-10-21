import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

/** Companies and colleges have no login -- they are managed in the admin portal. */
export type UserRole = "student" | "admin" | "ops";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  status: "active" | "suspended";
  email_verified: boolean;
  name: string | null;
  member_id: string | null;
  created_at: string;
  /** False while a Google signup still has to fill in the details form. */
  onboarding_completed: boolean;
}

interface SessionResponse {
  authenticated: boolean;
  user: AuthUser | null;
}

interface RegisterInput {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  college_name?: string;
  course?: string;
}

/** Second half of a Google signup -- the account already exists, so there is
 *  no email here. The form no longer asks for a password (Google already signs
 *  them in), but the field stays so one can still be set programmatically. */
interface CompleteProfileInput {
  full_name: string;
  phone: string;
  college_name: string;
  course: string;
  password?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the initial session check resolves -- guards against a
   *  logged-in user being bounced to /login on first paint. */
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  completeProfile: (input: CompleteProfileInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where a signup that still owes us the register-form details is sent. */
export const ONBOARDING_PATH = "/register";

/** True for a Google signup that stopped before the details form.
 *  Compares against `false` so a user object missing the field -- an older
 *  server, or a cached response -- reads as onboarded rather than trapped. */
export const needsOnboarding = (u: AuthUser | null): boolean =>
  u?.role === "student" && u.onboarding_completed === false;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // /auth/session never 401s, so a logged-out visitor isn't an error case.
      const data = await api.get<SessionResponse>("/auth/session");
      setUser(data.authenticated ? data.user : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<AuthUser>("/auth/login", { email, password });
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const u = await api.post<AuthUser>("/auth/register", { ...input });
    // Students are active immediately and the server sets a session cookie.
    setUser(u);
    return u;
  }, []);

  const completeProfile = useCallback(async (input: CompleteProfileInput) => {
    const u = await api.post<AuthUser>("/auth/complete-profile", { ...input });
    // Updating the context is what releases the onboarding gate in
    // ProtectedRoute, so the dashboard is reachable straight after this.
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, completeProfile, logout, refresh }),
    [user, loading, login, register, completeProfile, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
};
