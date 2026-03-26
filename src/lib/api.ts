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
  scanEndpoint: (endpoint: string, method?: string) =>
    apiFetch<{ issues: Array<Record<string, string>>; endpoint: string }>("/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, method }),
    }),

  getUserScans: () =>
    apiFetch<{ scans: Array<Record<string, unknown>> }>("/scans"),

  // ── LLM Cost Intelligence ─────────────────────────────────────────────────
  getLLMUsage: () =>
    apiFetch("/llm/usage"),

  getLLMSummary: () =>
    apiFetch("/llm/summary"),

  logLLMUsage: (data: { model: string; tokens_used: number; cost_inr: number }) =>
    apiFetch("/llm/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  // ── Alerts ────────────────────────────────────────────────────────────────
  getAlerts: () =>
    apiFetch<{ alerts: Array<Record<string, unknown>> }>("/alerts"),

  resolveAlert: (alertId: string) =>
    apiFetch(`/alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),

  // ── Compliance (PCI DSS v4.0.1 + GDPR) — Patent 4 ────────────────────────
  getCompliance: () =>
    apiFetch<{ checks: Array<Record<string, unknown>> }>("/compliance"),

  runComplianceCheck: (body: { control_name: string; evidence: string }) =>
    apiFetch("/compliance/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  generateComplianceReport: (organizationName?: string, reportType?: string) =>
    apiFetch("/compliance/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_name: organizationName || "Your Organization",
        report_type: reportType || "both",
      }),
    }),

  // ── Postman Collection Import (Patent 1 — Postman Refugee Engine) ─────────
  importPostmanCollection: (collection: Record<string, unknown>, scanEndpoints = true) =>
    apiFetch("/postman/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, scan_endpoints: scanEndpoints }),
    }),

  // ── Thinking Token Attribution (Patent 2) ─────────────────────────────────
  logThinkingTokens: (data: {
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

  getThinkingTokenStats: () =>
    apiFetch("/thinking-tokens/stats"),

  analyzeThinkingEfficiency: () =>
    apiFetch("/thinking-tokens/analyze"),

  // ── Unified Risk Score (Patent 1 Core) ────────────────────────────────────
  getUnifiedRiskScore: () =>
    apiFetch("/scan/risk-score"),

  // ── Shadow API Discovery (Patent 3) ───────────────────────────────────────
  discoverShadowApis: (data: {
    project_name: string;
    source_code_routes: Array<{ file: string; route: string; method: string; framework: string }>;
    observed_traffic: Array<{ path: string; method: string; count: number; last_seen: string }>;
  }) =>
    apiFetch("/shadow-api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getShadowApiInventory: () =>
    apiFetch("/shadow-api/inventory"),

  getShadowApiStats: () =>
    apiFetch("/shadow-api/stats"),

  resolveShadowApi: (endpointId: string, resolution: string) =>
    apiFetch(`/shadow-api/resolve/${encodeURIComponent(endpointId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    }),
};

