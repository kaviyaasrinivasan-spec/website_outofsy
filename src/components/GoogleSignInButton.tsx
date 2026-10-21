import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, API_BASE } from "@/lib/api";

interface Props {
  /** Where to land after a successful sign-in. Must be a relative path. */
  next?: string;
  label?: string;
}

/** Google's brand mark. Inlined so it works offline and needs no CDN. */
const GoogleMark = () => (
  <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

const GoogleSignInButton = ({ next = "/dashboard", label = "Continue with Google" }: Props) => {
  // Hide the button entirely if the server has no Google credentials, rather
  // than showing something that dead-ends in an error.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .get<{ enabled: boolean }>("/auth/google/status")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled !== true) return null;

  const handleClick = () => {
    // A full page navigation, not fetch -- the OAuth redirect chain has to
    // happen in the address bar so Google can show its consent screen.
    window.location.href =
      `${API_BASE}/auth/google/login?next=${encodeURIComponent(next)}`;
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={handleClick}
      >
        <GoogleMark />
        <span className="ml-2">{label}</span>
      </Button>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs uppercase tracking-wide text-muted-foreground">
            or
          </span>
        </div>
      </div>
    </>
  );
};

export default GoogleSignInButton;
