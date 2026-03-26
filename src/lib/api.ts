import { supabase } from "@/integrations/supabase/client";

function getBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (!raw || typeof raw !== "string") {
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
  // ── Security Scanner ──────────────────────────────────────────────────────
  scanEndpoint: (endpoint: string, userId: string) =>
    apiFetch<{ issues: Array<Record<string, string>>; endpoint: string }>("/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, user_id: userId }),
    }),

  getUserScans: (userId: string) =>
    apiFetch<{ scans: Array<Record<string, unknown>> }>(`/scans/${encodeURIComponent(userId)}`),

  // ── LLM Cost Intelligence ─────────────────────────────────────────────────
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

  // ── Alerts ────────────────────────────────────────────────────────────────
  getAlerts: (userId: string) =>
    apiFetch<{ alerts: Array<Record<string, unknown>> }>(`/alerts/${encodeURIComponent(userId)}`),

  resolveAlert: (alertId: string, userId: string) =>
    apiFetch(`/alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    }),

  // ── Compliance (PCI DSS v4.0.1 + GDPR) — Patent 4 ────────────────────────
  getCompliance: (userId: string) =>
    apiFetch<{ checks: Array<Record<string, unknown>> }>(`/compliance/${encodeURIComponent(userId)}`),

  runComplianceCheck: (body: { user_id: string; control_name: string; evidence: string }) =>
    apiFetch("/compliance/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  generateComplianceReport: (userId: string, organizationName?: string, reportType?: string) =>
    apiFetch(`/compliance/report/${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_name: organizationName || "Your Organization",
        report_type: reportType || "both",
      }),
    }),

  // ── Postman Collection Import (Patent 1 — Postman Refugee Engine) ─────────
  importPostmanCollection: (userId: string, collection: Record<string, unknown>, scanEndpoints = true) =>
    apiFetch("/postman/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, collection, scan_endpoints: scanEndpoints }),
    }),

  getPostmanImports: (userId: string) =>
    apiFetch(`/postman/imports/${encodeURIComponent(userId)}`),

  // ── Thinking Token Attribution (Patent 2) ─────────────────────────────────
  logThinkingTokens: (data: {
    user_id: string;
    model: string;
    endpoint_name?: string;
    feature_name?: string;
    usage_metadata: Record<string, unknown>;
    response_latency_ms?: number;
  }) =>
    apiFetch("/thinking-tokens/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getThinkingTokenStats: (userId: string) =>
    apiFetch(`/thinking-tokens/stats/${encodeURIComponent(userId)}`),

  analyzeThinkingEfficiency: (userId: string) =>
    apiFetch(`/thinking-tokens/analyze/${encodeURIComponent(userId)}`),

  // ── Unified Risk Score (Patent 1 Core) ────────────────────────────────────
  getUnifiedRiskScore: (userId: string) =>
    apiFetch(`/scan/risk-score/${encodeURIComponent(userId)}`),

  // ── Shadow API Discovery (Patent 3) ───────────────────────────────────────
  discoverShadowApis: (data: {
    user_id: string;
    project_name: string;
    source_code_routes: Array<{ file: string; route: string; method: string; framework: string }>;
    observed_traffic: Array<{ path: string; method: string; count: number; last_seen: string }>;
  }) =>
    apiFetch("/shadow-api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getShadowApiInventory: (userId: string) =>
    apiFetch(`/shadow-api/inventory/${encodeURIComponent(userId)}`),

  getShadowApiStats: (userId: string) =>
    apiFetch(`/shadow-api/stats/${encodeURIComponent(userId)}`),

  resolveShadowApi: (endpointId: string, userId: string, resolution: string) =>
    apiFetch(`/shadow-api/resolve/${encodeURIComponent(endpointId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, resolution }),
    }),
};
