import { supabase } from "@/integrations/supabase/client";

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface APIInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  requiresKey: boolean;
  testUrl: string;
}

export interface APIHealthMetrics {
  apiId: string;
  apiName: string;
  status: HealthStatus;
  latencyMs: number;
  statusCode: number;
  lastChecked: string;
  uptime24h: number;
  rateLimitRemaining: number | null;
  errorMessage: string | null;
}

export interface ProbeOptions {
  userApiKeys?: Record<string, string>;
  apiKeyIds?: Record<string, string>;
  useProxy?: boolean;
}

/** Curated built-in endpoints designed for safe liveness/health checks. */
export const APIs: APIInfo[] = [
  {
    id: "coingecko",
    name: "CoinGecko",
    category: "Finance",
    description: "Cryptocurrency market data",
    requiresKey: false,
    testUrl: "https://api.coingecko.com/api/v3/ping",
  },
  {
    id: "dogapi",
    name: "The Dog API",
    category: "Media",
    description: "Dog images and metadata",
    requiresKey: false,
    testUrl: "https://api.thedogapi.com/v1/images/search",
  },
  {
    id: "openweather",
    name: "OpenWeather",
    category: "Weather",
    description: "Current weather data",
    requiresKey: true,
    testUrl: "https://api.openweathermap.org/data/2.5/weather?q=London&appid=REPLACE_WITH_KEY",
  },
  {
    id: "nasa",
    name: "NASA",
    category: "Science",
    description: "Space and astronomy APIs",
    requiresKey: true,
    testUrl: "https://api.nasa.gov/planetary/apod?api_key=REPLACE_WITH_KEY",
  },
  {
    id: "opencage",
    name: "OpenCage Geocoder",
    category: "Geospatial",
    description: "Forward and reverse geocoding",
    requiresKey: true,
    testUrl: "https://api.opencagedata.com/geocode/v1/json?q=Bengaluru&key=REPLACE_WITH_KEY",
  },
  {
    id: "newsapi",
    name: "News API",
    category: "News",
    description: "Headlines and article search",
    requiresKey: true,
    testUrl: "https://newsapi.org/v2/top-headlines?country=us&apiKey=REPLACE_WITH_KEY",
  },
  {
    id: "omdb",
    name: "OMDb",
    category: "Media",
    description: "Movie and series metadata",
    requiresKey: true,
    testUrl: "https://www.omdbapi.com/?t=Inception&apikey=REPLACE_WITH_KEY",
  },
];

export const CATEGORIES = [...new Set(APIs.map(a => a.category))];

function applyApiKeyToUrl(url: string, apiKey: string): string {
  let updated = url;
  updated = updated.replace(/apikey=[^&]+/, `apikey=${encodeURIComponent(apiKey)}`);
  updated = updated.replace(/apiKey=[^&]+/, `apiKey=${encodeURIComponent(apiKey)}`);
  updated = updated.replace(/api_key=[^&]+/, `api_key=${encodeURIComponent(apiKey)}`);
  updated = updated.replace(/appid=[^&]+/, `appid=${encodeURIComponent(apiKey)}`);
  updated = updated.replace(/key=[^&]+/, `key=${encodeURIComponent(apiKey)}`);
  return updated;
}

async function fetchViaProxy(url: string, apiKeyId?: string): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!accessToken || !supabaseUrl || !anonKey) {
    throw new Error("Missing authenticated proxy credentials");
  }

  return fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/api-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "apikey": anonKey,
    },
    body: JSON.stringify({ url, apiKeyId }),
  });
}

/**
 * Probe a single API endpoint and return real health metrics
 */
// In-memory cache for API results (5 minute TTL)
const apiResultCache = new Map<string, { result: APIHealthMetrics; ts: number }>();
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function probeSingleApi(api: APIInfo, options: ProbeOptions = {}): Promise<APIHealthMetrics> {
  const userApiKeys = options.userApiKeys || {};
  const apiKeyIds = options.apiKeyIds || {};
  const useProxy = Boolean(options.useProxy);
  let url = api.testUrl;

  if (api.requiresKey && userApiKeys[api.id]) {
    url = applyApiKeyToUrl(url, userApiKeys[api.id]);
  }

  // Return cached result if fresh (avoids redundant network calls)
  const cacheKey = `${api.id}:${useProxy ? 'proxy' : 'direct'}`;
  const cached = apiResultCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < API_CACHE_TTL) {
    return { ...cached.result, lastChecked: new Date().toISOString() };
  }

  const start = performance.now();

  try {
    const controller = new AbortController();
    // Reduced timeout: 5s instead of 8s for faster failure detection
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = useProxy
      ? await fetchViaProxy(url, api.requiresKey ? apiKeyIds[api.id] : undefined)
      : await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          // Prefer cached response for speed
          cache: 'no-store',
        });

    clearTimeout(timeout);
    const latency = Math.round(performance.now() - start);

    let status: HealthStatus;
    if (response.ok) {
      status = latency < 1000 ? 'healthy' : 'degraded';
    } else if (response.status === 429) {
      status = 'degraded';
    } else {
      status = 'down';
    }

    let rateLimitRemaining: number | null = null;
    const rlHeader = response.headers.get('X-RateLimit-Remaining')
      || response.headers.get('x-ratelimit-remaining')
      || response.headers.get('RateLimit-Remaining');
    if (rlHeader) {
      rateLimitRemaining = parseInt(rlHeader, 10);
    }

    const result: APIHealthMetrics = {
      apiId: api.id,
      apiName: api.name,
      status,
      latencyMs: latency,
      statusCode: response.status,
      lastChecked: new Date().toISOString(),
      uptime24h: 0,
      rateLimitRemaining,
      errorMessage: response.ok ? null : `HTTP ${response.status} ${response.statusText}`,
    };
    // Cache successful results
    if (response.ok) {
      apiResultCache.set(cacheKey, { result, ts: Date.now() });
    }
    return result;
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    const message = err instanceof DOMException && err.name === 'AbortError'
      ? 'Timeout (5s)'
      : err instanceof TypeError
        ? 'CORS / Network Error'
        : String(err);

    return {
      apiId: api.id,
      apiName: api.name,
      status: 'down',
      latencyMs: latency,
      statusCode: 0,
      lastChecked: new Date().toISOString(),
      uptime24h: 0,
      rateLimitRemaining: null,
      errorMessage: message,
    };
  }
}

/**
 * Probe all APIs in parallel and return real metrics
 */
export async function probeAllApis(userApiKeys: Record<string, string> = {}, apiList?: APIInfo[]): Promise<APIHealthMetrics[]> {
  return probeAllApisWithOptions({ userApiKeys }, apiList);
}

export async function probeAllApisWithOptions(options: ProbeOptions = {}, apiList?: APIInfo[]): Promise<APIHealthMetrics[]> {
  const apisToProbe = apiList || APIs;
  // All probes run in parallel with Promise.allSettled for maximum speed
  const results = await Promise.allSettled(
    apisToProbe.map(api => probeSingleApi(api, options))
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      apiId: apisToProbe[i].id,
      apiName: apisToProbe[i].name,
      status: 'down' as HealthStatus,
      latencyMs: 0,
      statusCode: 0,
      lastChecked: new Date().toISOString(),
      uptime24h: 0,
      rateLimitRemaining: null,
      errorMessage: 'Probe failed',
    };
  });
}

/** Clear the API result cache (call when user manually refreshes) */
export function clearApiCache(): void {
  apiResultCache.clear();
}
