import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Redis } from "https://esm.sh/@upstash/redis@1.34.3";
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@1.1.2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { decryptKey } from "../_shared/key-crypto.ts";

const ALLOWED_HOSTS = new Set([
  "api.openweathermap.org",
  "api.opencagedata.com",
  "api.themoviedb.org",
  "api.alphavantage.co",
  "api.rawg.io",
  "api.thedogapi.com",
  "api.opentripmap.com",
  "api.groq.com",
  "api-inference.huggingface.co",
  "www.omdbapi.com",
  "api.ncei.noaa.gov",
  "api.coingecko.com",
]);

// Rate limit: 100 req/min per IP (shared via Redis when configured)
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 100;

// Fallback in-memory rate limit (stricter: 50/min) when Redis unavailable
const FALLBACK_RATE_LIMIT_MAX = 50;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const checkRateLimitInMemory = (key: string): boolean => {
  const now = Date.now();
  const record = requestCounts.get(key);
  if (!record || record.resetAt < now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW * 1000 });
    return true;
  }
  if (record.count >= FALLBACK_RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
};

let redisRatelimit: { limit: (id: string) => Promise<{ success: boolean }> } | null = null;
const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
if (redisUrl && redisToken) {
  try {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    redisRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX, `${RATE_LIMIT_WINDOW} s`),
      analytics: true,
    });
  } catch (e) {
    console.warn("Upstash Redis init failed, using in-memory rate limit:", e);
  }
}

async function checkRateLimit(key: string): Promise<boolean> {
  if (redisRatelimit) {
    const { success } = await redisRatelimit.limit(key);
    return success;
  }
  return checkRateLimitInMemory(key);
}

// Circuit breaker: prevent hammering failing upstreams (per-instance)
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30_000;
const circuitState = new Map<string, { failures: number; openUntil: number }>();

function isCircuitOpen(host: string): boolean {
  const state = circuitState.get(host);
  if (!state) return false;
  if (Date.now() < state.openUntil) return true;
  circuitState.delete(host);
  return false;
}

function recordCircuitFailure(host: string): void {
  const state = circuitState.get(host) ?? { failures: 0, openUntil: 0 };
  state.failures++;
  if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + CIRCUIT_RESET_MS;
  }
  circuitState.set(host, state);
}

function recordCircuitSuccess(host: string): void {
  circuitState.delete(host);
}

async function fetchWithCircuitBreaker(
  url: string,
  options: RequestInit
): Promise<Response> {
  const host = new URL(url).hostname;
  if (isCircuitOpen(host)) {
    return new Response(
      JSON.stringify({
        error: "Upstream temporarily unavailable. Please retry later.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  const FETCH_TIMEOUT_MS = 15_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      recordCircuitSuccess(host);
    } else if (res.status >= 500) {
      recordCircuitFailure(host);
    }
    return res;
  } catch (err) {
    clearTimeout(timeout);
    recordCircuitFailure(host);
    throw err;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(origin);
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const allowed = await checkRateLimit(`proxy:${clientIp}`);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(RATE_LIMIT_WINDOW),
        },
      }
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, apiKeyId } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedUrl = new URL(url);

    if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return new Response(JSON.stringify({ error: "Invalid protocol" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? ""
    );

    let apiKey: string | null = null;
    if (apiKeyId) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user?.id) {
        const { data: keyData } = await supabase
          .from("user_api_keys")
          .select("encrypted_key")
          .eq("id", apiKeyId)
          .eq("user_id", user.id)
          .single();

        const secret = Deno.env.get("KEY_ENCRYPTION_SECRET");
        if (keyData?.encrypted_key && secret) {
          apiKey = await decryptKey(keyData.encrypted_key, secret);
        }
      }
    }

    const fetchOptions: RequestInit = { method: "GET", headers: {} };

    if (apiKey) {
      const updatedUrl = new URL(parsedUrl);
      if (updatedUrl.searchParams.has("api_key")) {
        updatedUrl.searchParams.set("api_key", apiKey);
      } else if (updatedUrl.searchParams.has("key")) {
        updatedUrl.searchParams.set("key", apiKey);
      } else if (updatedUrl.searchParams.has("appid")) {
        updatedUrl.searchParams.set("appid", apiKey);
      }
      parsedUrl.href = updatedUrl.href;
    }

    const response = await fetchWithCircuitBreaker(parsedUrl.href, fetchOptions);
    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
