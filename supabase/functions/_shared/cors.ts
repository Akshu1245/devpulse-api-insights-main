const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
  "https://devpluse.in",
  "https://www.devpluse.in",
];

function getAllowedOrigins(): Set<string> {
  const denoEnv = (globalThis as { Deno?: { env?: { get: (key: string) => string | undefined } } }).Deno?.env;
  const configured = denoEnv?.get("APP_ALLOWED_ORIGINS") ?? "";
  if (!configured.trim()) {
    return new Set(DEFAULT_ALLOWED_ORIGINS);
  }

  const parsed = configured
    .split(",")
    .map((v: string) => v.trim())
    .filter(Boolean);

  return new Set(parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS);
}

export const ALLOWED_ORIGINS = getAllowedOrigins();

export function buildCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}
