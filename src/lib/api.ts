function getBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (!raw || typeof raw !== "string") {
    throw new Error("VITE_API_BASE_URL is not set. Add it to your .env (see .env.example).");
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

export const api = {
  scanEndpoint: (endpoint: string, userId: string) =>
    fetch(`${getBaseUrl()}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, user_id: userId }),
    }).then((r) => parseJson<{ issues: Array<Record<string, string>>; endpoint: string }>(r)),

  getUserScans: (userId: string) =>
    fetch(`${getBaseUrl()}/scans/${encodeURIComponent(userId)}`).then((r) =>
      parseJson<{ scans: Array<Record<string, unknown>> }>(r)
    ),

  getLLMUsage: (userId: string) =>
    fetch(`${getBaseUrl()}/llm/usage/${encodeURIComponent(userId)}`).then((r) => parseJson(r)),

  getLLMSummary: (userId: string) =>
    fetch(`${getBaseUrl()}/llm/summary/${encodeURIComponent(userId)}`).then((r) => parseJson(r)),

  logLLMUsage: (data: { user_id: string; model: string; tokens_used: number; cost_inr: number }) =>
    fetch(`${getBaseUrl()}/llm/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => parseJson(r)),

  getAlerts: (userId: string) =>
    fetch(`${getBaseUrl()}/alerts/${encodeURIComponent(userId)}`).then((r) =>
      parseJson<{ alerts: Array<Record<string, unknown>> }>(r)
    ),

  resolveAlert: (alertId: string, userId: string) =>
    fetch(`${getBaseUrl()}/alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    }).then((r) => parseJson(r)),

  getCompliance: (userId: string) =>
    fetch(`${getBaseUrl()}/compliance/${encodeURIComponent(userId)}`).then((r) =>
      parseJson<{ checks: Array<Record<string, unknown>> }>(r)
    ),

  runComplianceCheck: (body: { user_id: string; control_name: string; evidence: string }) =>
    fetch(`${getBaseUrl()}/compliance/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => parseJson(r)),
};
