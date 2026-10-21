/**
 * Thin API client.
 *
 * `credentials: "include"` is essential -- the session lives in an httpOnly
 * cookie, and the browser will not attach it cross-origin (5173 -> 8001)
 * without this.
 */
export const API_BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * Absolute URL for a stored file.
 *
 * Uploads are saved as "/uploads/<name>", which is a path on the API rather
 * than on the site, so it has to be prefixed. Anything already absolute --
 * every resume added before uploads existed is a Google Drive link -- is left
 * exactly as it is.
 */
export const fileUrl = (stored: string | null | undefined): string => {
  if (!stored) return "";
  if (/^https?:\/\//i.test(stored)) return stored;
  return `${API_BASE}${stored.startsWith("/") ? "" : "/"}${stored}`;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Json = Record<string, unknown>;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please check your connection.");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractError(body, res.status));
  }
  return body as T;
}

/** FastAPI reports errors as a string detail, or a list of validation objects. */
function extractError(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;

  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      if (first?.msg) {
        const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null;
        return field ? `${String(field)}: ${first.msg}` : first.msg;
      }
    }
  }

  if (status === 401) return "Please sign in to continue.";
  if (status === 403) return "You do not have permission to do that.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "Request failed. Please try again.";
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: Json) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: Json) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: Json) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
