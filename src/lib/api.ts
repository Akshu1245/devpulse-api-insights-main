import { supabase } from "@/integrations/supabase/client";

function getBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (!raw || typeof raw !== "string") {
    // Default to the Vercel-mounted backend path when env is not provided.
    return "/_/backend";
  }
  return raw.replace(/\/$/, "");
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || res.statusText || "Invalid JSON from API");
  }
  if (!res.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : text || res.statusText;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return body as T;
}

async function authHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const headers = new Headers(extra || {});
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders(init?.headers);
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
  });
  return parseJson<T>(res);
}

export const api = {
  scanEndpoint: (endpoint: string, userId: string) =>
    apiFetch<{ issues: Array<Record<string, string>>; endpoint: string }>("/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, user_id: userId }),
    }),

  getUserScans: (userId: string) =>
    apiFetch<{ scans: Array<Record<string, unknown>> }>(`/scans/${encodeURIComponent(userId)}`),

  getLLMUsage: (userId: string) =>
    apiFetch(`/llm/usage/${encodeURIComponent(userId)}`),

  getLLMSummary: (userId: string) =>
    apiFetch(`/llm/summary/${encodeURIComponent(userId)}`),

  logLLMUsage: (data: { user_id: string; model: string; tokens_used: number; cost_inr: number }) =>
    apiFetch("/llm/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getAlerts: (userId: string) =>
    apiFetch<{ alerts: Array<Record<string, unknown>> }>(`/alerts/${encodeURIComponent(userId)}`),

  resolveAlert: (alertId: string, userId: string) =>
    apiFetch(`/alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    }),

  getCompliance: (userId: string) =>
    apiFetch<{ checks: Array<Record<string, unknown>> }>(`/compliance/${encodeURIComponent(userId)}`),

  runComplianceCheck: (body: { user_id: string; control_name: string; evidence: string }) =>
    apiFetch("/compliance/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
