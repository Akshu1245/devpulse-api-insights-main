/**
 * apiClient — thin fetch wrapper that automatically attaches the Supabase
 * JWT to every request sent to the DevPulse backend.
 *
 * Usage:
 *   import { apiClient } from "@/lib/apiClient";
 *
 *   // GET
 *   const data = await apiClient.get<MyType>("/scans/user-uuid");
 *
 *   // POST
 *   const result = await apiClient.post<ResultType>("/scan", { endpoint: "...", user_id: "..." });
 */

import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = `${BACKEND_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = await getAuthHeaders();

  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      detail = json?.detail ?? detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const apiClient = {
  get: <T>(path: string, extraHeaders?: Record<string, string>) =>
    request<T>("GET", path, undefined, extraHeaders),

  post: <T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
    request<T>("POST", path, body, extraHeaders),

  put: <T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
    request<T>("PUT", path, body, extraHeaders),

  patch: <T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
    request<T>("PATCH", path, body, extraHeaders),

  delete: <T>(path: string, extraHeaders?: Record<string, string>) =>
    request<T>("DELETE", path, undefined, extraHeaders),
};

/**
 * Convenience: returns the current access token synchronously from the
 * cached Supabase session (may be null if not signed in).
 *
 * Prefer `apiClient.*` for actual requests; use this only when you need
 * the raw token (e.g. to pass to a WebSocket or third-party SDK).
 */
export function getAccessTokenSync(): string | null {
  // supabase.auth.session() is synchronous in supabase-js v2 via the
  // internal storage; we use the async path in apiClient for correctness.
  // This helper is best-effort for non-critical use cases.
  try {
    const raw = localStorage.getItem("sb-" + (import.meta.env.VITE_SUPABASE_URL?.split("//")[1]?.split(".")[0] ?? "") + "-auth-token");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}
