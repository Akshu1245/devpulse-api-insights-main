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

/** Built-in catalog is empty — add endpoints via “Manage APIs” on the health dashboard. */
export const APIs: APIInfo[] = [];

export const CATEGORIES = [...new Set(APIs.map(a => a.category))];

/**
 * Probe a single API endpoint and return real health metrics
 */
async function probeSingleApi(api: APIInfo, userApiKeys: Record<string, string> = {}): Promise<APIHealthMetrics> {
  let url = api.testUrl;

  if (api.requiresKey && userApiKeys[api.id]) {
    url = url.replace(/apikey=[^&]+/, `apikey=${encodeURIComponent(userApiKeys[api.id])}`);
    url = url.replace(/api_key=[^&]+/, `api_key=${encodeURIComponent(userApiKeys[api.id])}`);
    url = url.replace(/appid=[^&]+/, `appid=${encodeURIComponent(userApiKeys[api.id])}`);
    url = url.replace(/key=[^&]+/, `key=${encodeURIComponent(userApiKeys[api.id])}`);
  }

  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
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

    return {
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
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    const message = err instanceof DOMException && err.name === 'AbortError'
      ? 'Timeout (8s)'
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
  const apisToProbe = apiList || APIs;
  const results = await Promise.allSettled(
    apisToProbe.map(api => probeSingleApi(api, userApiKeys))
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
