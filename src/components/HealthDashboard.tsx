"use client";

import { useState, useEffect, useCallback, useRef, useMemo, memo, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, ArrowUp, ArrowDown, Minus, RefreshCw, Wifi, WifiOff, Clock, Key, TrendingUp, Loader2, Eye, ChevronDown, Settings2, AlertTriangle, Badge, History } from "lucide-react";
import { probeAllApisWithOptions, clearApiCache, APIs, type APIInfo, type APIHealthMetrics, type HealthStatus } from "@/data/apiData";
import ApiKeyManager, { type UserApiKey } from "./ApiKeyManager";
import ApiRegistryManager, { type CustomAPI } from "./ApiRegistryManager";
import ApiStatusBadge from "./ApiStatusBadge";
import ApiTrendChart, { type TrendPoint } from "./ApiTrendChart";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import { useHealthStore } from "@/hooks/useHealthStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig: Record<HealthStatus, { color: string; bg: string; label: string; icon: typeof Wifi }> = {
  healthy: { color: "text-status-healthy", bg: "bg-status-healthy/10", label: "Healthy", icon: Wifi },
  degraded: { color: "text-status-degraded", bg: "bg-status-degraded/10", label: "Degraded", icon: Clock },
  down: { color: "text-status-down", bg: "bg-status-down/10", label: "Down", icon: WifiOff },
  unknown: { color: "text-muted-foreground", bg: "bg-muted/10", label: "Unknown", icon: Minus },
};

const LatencyBar = memo(function LatencyBar({ latency, max = 3000 }: { latency: number; max?: number }) {
  const pct = Math.min((latency / max) * 100, 100);
  const color = latency < 300 ? "bg-status-healthy" : latency < 1000 ? "bg-status-degraded" : "bg-status-down";
  return (
    <div className="w-full h-1.5 rounded-full bg-muted/30">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
});

const AnimatedStat = memo(function AnimatedStat({ label, value, icon: Icon, color, borderColor }: {
  label: string; value: number | string; icon: any; color: string; borderColor: string;
}) {
  const numericValue = typeof value === "number" ? value : parseInt(value) || 0;
  const animated = useAnimatedCounter(numericValue);
  const suffix = typeof value === "string" && value.includes("ms") ? "ms" : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`glass-card-hover rounded-xl p-5 border ${borderColor}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className={`text-3xl font-bold font-mono ${color}`}>
        {animated}{suffix}
      </p>
    </motion.div>
  );
});

const ResponsePreview = memo(function ResponsePreview({ responseData }: { responseData: any }) {
  if (!responseData) return null;
  const json = JSON.stringify(responseData, null, 2);
  const truncated = json.length > 300 ? json.slice(0, 300) + "\n..." : json;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-3 overflow-hidden"
    >
      <pre className="text-[10px] font-mono leading-relaxed p-3 rounded-lg bg-muted/30 border border-border overflow-x-auto max-h-40 text-muted-foreground">
        {truncated}
      </pre>
    </motion.div>
  );
});

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="w-2.5 h-2.5 rounded-full bg-muted/50" />
              <Skeleton className="w-28 h-4 bg-muted/50" />
            </div>
            <Skeleton className="w-16 h-5 rounded bg-muted/50" />
          </div>
          <Skeleton className="w-full h-1.5 rounded-full bg-muted/50" />
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="w-16 h-3 bg-muted/50" />
              <Skeleton className="w-12 h-3 bg-muted/50" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="w-14 h-3 bg-muted/50" />
              <Skeleton className="w-10 h-3 bg-muted/50" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const ApiCard = memo(function ApiCard({ m, hasKey, responseData, expandedPreview, onTogglePreview }: {
  m: APIHealthMetrics;
  hasKey: boolean;
  responseData: any;
  expandedPreview: string | null;
  onTogglePreview: (id: string) => void;
}) {
  const cfg = statusConfig[m.status];
  const isPreviewOpen = expandedPreview === m.apiId;

  return (
    <div className="card-3d">
      <div className="card-3d-inner glass-card-hover gradient-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${m.status === "healthy" ? "bg-status-healthy animate-pulse-soft" : m.status === "degraded" ? "bg-status-degraded" : "bg-status-down"}`} />
            <h3 className="font-semibold text-foreground">{m.apiName}</h3>
            {hasKey && <Key className="w-3 h-3 text-primary" />}
          </div>
          <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Latency</span>
            <span className="font-mono text-foreground">{m.latencyMs}ms</span>
          </div>
          <LatencyBar latency={m.latencyMs} />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">24h Uptime</span>
            <span className="font-mono text-foreground">
              {m.uptime24h > 0 ? `${m.uptime24h.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className={`font-mono ${m.statusCode >= 200 && m.statusCode < 300 ? "text-status-healthy" : m.statusCode === 0 ? "text-status-down" : "text-status-degraded"}`}>
              {m.statusCode || "ERR"}
            </span>
          </div>
          {m.rateLimitRemaining !== null && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rate Limit</span>
              <span className="font-mono text-foreground">{m.rateLimitRemaining} left</span>
            </div>
          )}
          {m.errorMessage && (
            <p className="text-xs text-status-down mt-1 font-mono">{m.errorMessage}</p>
          )}

          {responseData && (
            <button
              onClick={() => onTogglePreview(m.apiId)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors mt-1 font-mono"
            >
              <Eye className="w-3 h-3" />
              Response Preview
              <ChevronDown className={`w-3 h-3 transition-transform ${isPreviewOpen ? "rotate-180" : ""}`} />
            </button>
          )}

          <AnimatePresence>
            {isPreviewOpen && (
              <ResponsePreview responseData={responseData} />
            )}
          </AnimatePresence>

          <p className="text-[10px] text-muted-foreground font-mono pt-1">
            {new Date(m.lastChecked).toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
});

export default function HealthDashboard() {
  const { metrics, probeCount, isProbing, setMetrics, setProbeCount, setIsProbing } = useHealthStore();
  const { user } = useAuth();
  const [filter, setFilter] = useState<HealthStatus | "all">("all");
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>(() => {
    try {
      const saved = localStorage.getItem("devpulse_api_keys");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [customApis, setCustomApis] = useState<CustomAPI[]>(() => {
    try {
      const saved = localStorage.getItem("devpulse_custom_apis");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [disabledApiIds, setDisabledApiIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("devpulse_disabled_apis");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [showRegistryManager, setShowRegistryManager] = useState(false);
  const [showStatusBadge, setShowStatusBadge] = useState(false);
  const [incidents, setIncidents] = useState<{ apiId: string; apiName: string; at: number }[]>([]);
  const [showTrends, setShowTrends] = useState(false);
  const [expandedTrend, setExpandedTrend] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<Record<string, TrendPoint[]>>({});
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<Record<string, any>>({});
  const trendDataRef = useRef<Record<string, TrendPoint[]>>({});
  const initialUptimeHistory = useMemo<Record<string, boolean[]>>(() => {
    try {
      const saved = localStorage.getItem("devpulse_uptime_history");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, []);
  const uptimeHistoryRef = useRef<Record<string, boolean[]>>(initialUptimeHistory);
  const probeCountRef = useRef(0);
  const prefsLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadApiPreferences() {
      if (!user) {
        prefsLoadedRef.current = true;
        return;
      }

      prefsLoadedRef.current = false;

      const { data } = await supabase
        .from("user_api_preferences" as any)
        .select("custom_apis, disabled_api_ids")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        const cloudCustom = Array.isArray(data.custom_apis) ? (data.custom_apis as CustomAPI[]) : [];
        const cloudDisabled = Array.isArray(data.disabled_api_ids) ? (data.disabled_api_ids as string[]) : [];
        setCustomApis(cloudCustom);
        setDisabledApiIds(new Set(cloudDisabled));
      }

      prefsLoadedRef.current = true;
    }

    void loadApiPreferences();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist custom API preferences locally and to Supabase for authenticated users.
  useEffect(() => {
    localStorage.setItem("devpulse_custom_apis", JSON.stringify(customApis));
    localStorage.setItem("devpulse_disabled_apis", JSON.stringify([...disabledApiIds]));

    if (!user || !prefsLoadedRef.current) return;

    void supabase
      .from("user_api_preferences" as any)
      .upsert(
        {
          user_id: user.id,
          custom_apis: customApis,
          disabled_api_ids: [...disabledApiIds],
        },
        { onConflict: "user_id" }
      );
  }, [customApis, disabledApiIds, user]);

  useEffect(() => {
    if (user) return;
    localStorage.setItem("devpulse_api_keys", JSON.stringify(apiKeys));
  }, [apiKeys, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadStoredKeys() {
      if (!user) {
        try {
          const saved = localStorage.getItem("devpulse_api_keys");
          if (!cancelled) setApiKeys(saved ? JSON.parse(saved) : []);
        } catch {
          if (!cancelled) setApiKeys([]);
        }
        return;
      }

      const { data, error } = await supabase.functions.invoke("user-api-keys", {
        body: { action: "list" },
      });

      if (cancelled) return;
      if (error || !data?.keys) {
        setApiKeys([]);
        return;
      }

      setApiKeys(
        data.keys.map((row: { id: string; provider: string; key_alias: string | null; masked_key: string }) => ({
          id: row.id,
          name: row.key_alias || row.provider,
          key: row.masked_key,
          apiId: row.provider,
        }))
      );
    }

    void loadStoredKeys();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const getProbeOptions = useCallback(async (): Promise<{ userApiKeys: Record<string, string>; apiKeyIds: Record<string, string>; useProxy: boolean }> => {
    if (!user) {
      const map: Record<string, string> = {};
      apiKeys.forEach((key) => {
        map[key.apiId] = key.key;
      });
      return {
        userApiKeys: map,
        apiKeyIds: {},
        useProxy: false,
      };
    }

    const keyIds: Record<string, string> = {};
    apiKeys.forEach((key) => {
      keyIds[key.apiId] = key.id;
    });

    return {
      userApiKeys: {},
      apiKeyIds: keyIds,
      useProxy: true,
    };
  }, [user, apiKeys]);

  // Compute active API list (built-in + custom, minus disabled)
  const activeApis = useMemo<APIInfo[]>(() => {
    const all: APIInfo[] = [...APIs, ...customApis];
    return all.filter(a => !disabledApiIds.has(a.id));
  }, [customApis, disabledApiIds]);

  // Use refs to avoid recreating runProbe on every render
  const activeApisRef = useRef(activeApis);
  const getProbeOptionsRef = useRef(getProbeOptions);
  activeApisRef.current = activeApis;
  getProbeOptionsRef.current = getProbeOptions;

  const runProbe = useCallback(async () => {
    const { isProbing: currentlyProbing } = useHealthStore.getState();
    if (currentlyProbing) return;

    const apis = activeApisRef.current;
    if (apis.length === 0) {
      setMetrics([]);
      setProbeCount(0);
      setIsProbing(false);
      return;
    }

    setIsProbing(true);
    try {
      const probeOptions = await getProbeOptionsRef.current();
      const results = await probeAllApisWithOptions(probeOptions, apis);

      const updatedResults = results.map(m => {
        const history = uptimeHistoryRef.current[m.apiId] || [];
        history.push(m.status === 'healthy' || m.status === 'degraded');
        if (history.length > 288) history.shift();
        uptimeHistoryRef.current[m.apiId] = history;
        const uptime = history.length > 0 ? (history.filter(Boolean).length / history.length) * 100 : 0;
        return { ...m, uptime24h: uptime };
      });

      try {
        localStorage.setItem("devpulse_uptime_history", JSON.stringify(uptimeHistoryRef.current));
        if (results.some(m => m.status === 'down')) {
          const incidents = JSON.parse(localStorage.getItem("devpulse_incidents") || "[]");
          results.filter(m => m.status === 'down').forEach(m => {
            incidents.push({ apiId: m.apiId, apiName: m.apiName, at: Date.now() });
          });
          if (incidents.length > 100) incidents.splice(0, incidents.length - 100);
          localStorage.setItem("devpulse_incidents", JSON.stringify(incidents));
        }

        // Sync to cloud for authenticated users
        if (user) {
          const snapshots = results.map(m => ({
            api_id: m.apiId,
            api_name: m.apiName,
            status: m.status,
            latency_ms: m.latencyMs,
            status_code: m.statusCode,
          }));

          await supabase
            .from("health_status_snapshots" as any)
            .insert(snapshots)
            .catch(err => console.warn("Failed to sync health snapshots to cloud:", err));
        }
      } catch { /* ignore */ }

      setMetrics(updatedResults);
      probeCountRef.current += 1;
      setProbeCount(probeCountRef.current);

      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const updated = { ...trendDataRef.current };
      updatedResults.forEach(m => {
        const existing = updated[m.apiId] || [];
        existing.push({ time, latency: m.latencyMs, status: m.statusCode });
        if (existing.length > 30) existing.shift();
        updated[m.apiId] = existing;
      });
      trendDataRef.current = updated;
      setTrendData({ ...updated });

      // Capture response previews (with timeout to avoid blocking)
      const previews: Record<string, any> = {};
      const previewPromises = apis.slice(0, 6).map(async (api) => {
        try {
          let url = api.testUrl;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);

          if (probeOptions.useProxy) {
            const body: { url: string; apiKeyId?: string } = { url };
            const apiKeyId = probeOptions.apiKeyIds[api.id];
            if (api.requiresKey && apiKeyId) {
              body.apiKeyId = apiKeyId;
            }
            const { data, error } = await supabase.functions.invoke("api-proxy", { body });
            clearTimeout(timeout);
            if (error) {
              throw new Error(error.message || "Preview proxy failed");
            }
            if (data) {
              if (Array.isArray(data)) {
                previews[api.id] = data.slice(0, 1);
              } else if (typeof data === "object") {
                const keys = Object.keys(data).slice(0, 5);
                const small: Record<string, unknown> = {};
                keys.forEach(k => {
                  const val = (data as Record<string, unknown>)[k];
                  if (typeof val === "string" && val.length > 100) small[k] = val.slice(0, 100) + "...";
                  else if (Array.isArray(val)) small[k] = `[${val.length} items]`;
                  else small[k] = val;
                });
                previews[api.id] = small;
              }
            }
            return;
          }

          if (api.requiresKey && probeOptions.userApiKeys[api.id]) {
            url = url.replace(/apikey=[^&]+/, `apikey=${encodeURIComponent(probeOptions.userApiKeys[api.id])}`);
            url = url.replace(/apiKey=[^&]+/, `apiKey=${encodeURIComponent(probeOptions.userApiKeys[api.id])}`);
            url = url.replace(/api_key=[^&]+/, `api_key=${encodeURIComponent(probeOptions.userApiKeys[api.id])}`);
            url = url.replace(/appid=[^&]+/, `appid=${encodeURIComponent(probeOptions.userApiKeys[api.id])}`);
            url = url.replace(/key=[^&]+/, `key=${encodeURIComponent(probeOptions.userApiKeys[api.id])}`);
          }

          const fetchRes = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);
          if (fetchRes.ok) {
            const data = await fetchRes.json();
            if (Array.isArray(data)) {
              previews[api.id] = data.slice(0, 1);
            } else if (typeof data === "object") {
              const keys = Object.keys(data).slice(0, 5);
              const small: any = {};
              keys.forEach(k => {
                const val = data[k];
                if (typeof val === "string" && val.length > 100) small[k] = val.slice(0, 100) + "...";
                else if (Array.isArray(val)) small[k] = `[${val.length} items]`;
                else small[k] = val;
              });
              previews[api.id] = small;
            }
          }
        } catch { /* skip */ }
      });
      await Promise.allSettled(previewPromises);
      if (Object.keys(previews).length > 0) {
        setResponseData(prev => ({ ...prev, ...previews }));
      }
    } catch {
      /* probe failed */
    } finally {
      setIsProbing(false);
    }
  }, [setMetrics, setProbeCount, setIsProbing]);

  useEffect(() => {
    runProbe();
    const interval = setInterval(runProbe, 30000);
    return () => clearInterval(interval);
  }, [runProbe]);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("devpulse_incidents") || "[]");
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      setIncidents(raw.filter((i: { at: number }) => i.at > cutoff).slice(-20).reverse());
    } catch { /* ignore */ }
  }, [metrics]);

  // Load incidents from cloud for authenticated users
  useEffect(() => {
    if (!user) return;

    const loadCloudIncidents = async () => {
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("health_status_snapshots" as any)
          .select("api_id, api_name, recorded_at")
          .eq("user_id", user.id)
          .eq("status", "down")
          .gte("recorded_at", oneDayAgo)
          .order("recorded_at", { ascending: false })
          .limit(20);

        if (!error && data) {
          const cloudIncidents = data.map((row: any) => ({
            apiId: row.api_id,
            apiName: row.api_name,
            at: new Date(row.recorded_at).getTime(),
          }));
          setIncidents(cloudIncidents);
        }
      } catch (err) {
        console.error("Error loading cloud incidents:", err);
      }
    };

    void loadCloudIncidents();
  }, [user]);

  const handleAddKey = useCallback(async (key: UserApiKey) => {
    if (!user) {
      setApiKeys(prev => [key, ...prev.filter(existing => existing.apiId !== key.apiId)]);
      return;
    }

    const { data, error } = await supabase.functions.invoke("user-api-keys", {
      body: {
        action: "upsert",
        provider: key.apiId,
        key: key.key,
        keyAlias: key.name,
      },
    });

    if (error || !data?.key) return;

    setApiKeys(prev => [
      {
        id: data.key.id,
        name: data.key.key_alias || data.key.provider,
        key: `••••${key.key.slice(-4)}`,
        apiId: data.key.provider,
      },
      ...prev.filter(item => item.id !== data.key.id),
    ]);
  }, [user]);

  const handleRemoveKey = useCallback(async (id: string) => {
    if (!user) {
      setApiKeys(prev => prev.filter(k => k.id !== id));
      return;
    }

    await supabase.functions.invoke("user-api-keys", {
      body: { action: "delete", id },
    });
    setApiKeys(prev => prev.filter(k => k.id !== id));
  }, [user]);

  // Registry handlers
  const handleToggleApi = useCallback((id: string) => {
    setDisabledApiIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const handleAddCustomApi = useCallback((api: CustomAPI) => setCustomApis(prev => [...prev, api]), []);
  const handleRemoveCustomApi = useCallback((id: string) => {
    setCustomApis(prev => prev.filter(a => a.id !== id));
    setDisabledApiIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, []);
  const handleEditCustomApi = useCallback((api: CustomAPI) => {
    setCustomApis(prev => prev.map(a => a.id === api.id ? api : a));
  }, []);

  const handleTogglePreview = useCallback((id: string) => {
    setExpandedPreview(prev => prev === id ? null : id);
  }, []);

  const { filtered, healthy, degraded, down, avgLatency, latencyBenchmark } = useMemo(() => {
    const healthy = metrics.filter(m => m.status === "healthy").length;
    const degraded = metrics.filter(m => m.status === "degraded").length;
    const down = metrics.filter(m => m.status === "down").length;
    const withLatency = metrics.filter(m => m.latencyMs > 0);
    const avgLatency = withLatency.length
      ? Math.round(withLatency.reduce((s, m) => s + m.latencyMs, 0) / withLatency.length)
      : 0;
    const filtered = filter === "all" ? metrics : metrics.filter(m => m.status === filter);

    const sorted = [...withLatency].map(m => m.latencyMs).sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const latencyBenchmark = median > 0 ? {
      median,
      fast: withLatency.filter(m => m.latencyMs < median * 0.6),
      slow: withLatency.filter(m => m.latencyMs > median * 1.5),
    } : null;

    return { filtered, healthy, degraded, down, avgLatency, latencyBenchmark };
  }, [metrics, filter]);

  const hasData = metrics.length > 0;
  const apiKeyIds = useMemo(() => new Set(apiKeys.map(k => k.apiId)), [apiKeys]);

  return (
    <section id="dashboard" className="py-24 px-6 relative">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
                API Health <span className="text-primary">Monitor</span>
              </h2>
              {isProbing && (
                <span className="flex items-center gap-1.5 text-xs font-mono text-primary/80">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  PROBING
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => metrics.length > 0 && setShowStatusBadge(true)}
                disabled={metrics.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                title={metrics.length === 0 ? "Run a probe first" : "Get embeddable status badge"}
              >
                <Badge className="w-4 h-4" />
                Status Badge
              </button>
              <button
                onClick={() => setShowTrends(!showTrends)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  showTrends
                    ? "bg-secondary/15 text-secondary border border-secondary/25"
                    : "glass-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Trends
              </button>
              <button
                onClick={() => setShowRegistryManager(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                <Settings2 className="w-4 h-4" />
                Manage APIs
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-mono">
                  {activeApis.length}
                </span>
              </button>
              <button
                onClick={() => setShowKeyManager(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                <Key className="w-4 h-4" />
                API Keys
                {apiKeys.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-mono">
                    {apiKeys.length}
                  </span>
                )}
              </button>
            </div>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl font-light">
            Live health probing across {activeApis.length} API{activeApis.length === 1 ? "" : "s"} from your registry. Open Manage APIs to add GET endpoints. Probed every 30 seconds from your browser.
            {probeCount > 0 && (
              <span className="text-primary/70 font-mono text-sm ml-2">({probeCount} probes)</span>
            )}
          </p>
        </motion.div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <AnimatedStat label="Healthy" value={healthy} icon={ArrowUp} color="text-status-healthy" borderColor="border-status-healthy/15" />
          <AnimatedStat label="Degraded" value={degraded} icon={Minus} color="text-status-degraded" borderColor="border-status-degraded/15" />
          <AnimatedStat label="Down" value={down} icon={ArrowDown} color="text-status-down" borderColor="border-status-down/15" />
          <AnimatedStat label="Avg Latency" value={`${avgLatency}ms`} icon={Clock} color="text-secondary" borderColor="border-secondary/15" />
        </div>

        {/* Incident Timeline - last 24h down events */}
        {incidents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 glass-card rounded-xl p-4 border border-status-down/20"
          >
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-status-down" />
              <h3 className="text-sm font-semibold text-foreground">Incident timeline (24h)</h3>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {incidents.map((inc, i) => (
                <div key={`${inc.apiId}-${inc.at}`} className="flex items-center gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-down shrink-0" />
                  <span className="text-foreground font-medium">{inc.apiName}</span>
                  <span className="text-muted-foreground">down at</span>
                  <span className="font-mono text-muted-foreground">
                    {new Date(inc.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Latency Benchmark - fast vs slow vs median */}
        {latencyBenchmark && (latencyBenchmark.fast.length > 0 || latencyBenchmark.slow.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 glass-card rounded-xl p-4 border border-border"
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-secondary" />
              <h3 className="text-sm font-semibold text-foreground">Latency benchmark (median: {latencyBenchmark.median}ms)</h3>
            </div>
            <div className="flex flex-wrap gap-4">
              {latencyBenchmark.fast.length > 0 && (
                <div>
                  <p className="text-xs text-status-healthy font-medium mb-1">⚡ Fast (&lt;{Math.round(latencyBenchmark.median * 0.6)}ms)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {latencyBenchmark.fast.map(m => (
                      <span key={m.apiId} className="px-2 py-0.5 rounded-md bg-status-healthy/15 text-status-healthy text-xs font-mono">
                        {m.apiName} {m.latencyMs}ms
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {latencyBenchmark.slow.length > 0 && (
                <div>
                  <p className="text-xs text-status-degraded font-medium mb-1">🐢 Slow (&gt;{Math.round(latencyBenchmark.median * 1.5)}ms)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {latencyBenchmark.slow.map(m => (
                      <span key={m.apiId} className="px-2 py-0.5 rounded-md bg-status-degraded/15 text-status-degraded text-xs font-mono">
                        {m.apiName} {m.latencyMs}ms
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Rate Limit Watch - APIs with rate limit data */}
        {metrics.some(m => m.rateLimitRemaining !== null) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 glass-card rounded-xl p-4 border border-border"
          >
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Rate Limit Watch</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {metrics
                .filter(m => m.rateLimitRemaining !== null)
                .map(m => {
                  const remaining = m.rateLimitRemaining!;
                  const isLow = remaining < 100;
                  return (
                    <div
                      key={m.apiId}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-mono ${
                        isLow ? "bg-status-down/15 border border-status-down/30" : "bg-muted/20"
                      }`}
                    >
                      <span className="text-foreground">{m.apiName}</span>
                      <span className={isLow ? "text-status-down font-semibold" : "text-muted-foreground"}>
                        {remaining} left
                      </span>
                      {isLow && <AlertTriangle className="w-3.5 h-3.5 text-status-down" />}
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}

        {/* Trend Charts */}
        <AnimatePresence>
          {showTrends && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="w-5 h-5 text-secondary" />
                <h3 className="text-lg font-semibold text-foreground font-serif">Live Latency Trends</h3>
                <span className="text-xs text-muted-foreground font-mono">
                  {probeCount > 0 ? `${Math.min(probeCount, 30)} data points` : 'Collecting...'}
                </span>
              </div>
              {probeCount === 0 ? (
                <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running first probe...
                </div>
              ) : (
                <div className="space-y-2">
                  {activeApis.map(api => (
                    <ApiTrendChart
                      key={api.id}
                      apiName={api.name}
                      data={trendData[api.id] || []}
                      isExpanded={expandedTrend === api.id}
                      onToggle={() => setExpandedTrend(prev => prev === api.id ? null : api.id)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters + refresh */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex gap-2">
            {(["all", "healthy", "degraded", "down"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  filter === f
                    ? "bg-primary/15 text-primary border border-primary/25"
                    : "glass-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => { clearApiCache(); runProbe(); }}
            disabled={isProbing}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl glass-card text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 active:scale-95"
            style={{ touchAction: "manipulation" }}
          >
            {isProbing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isProbing ? "Probing..." : "Probe Now"}
          </button>
        </div>

        {/* API Grid */}
        {activeApis.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 sm:p-14 text-center border border-border max-w-xl mx-auto">
            <p className="text-foreground font-medium mb-2">No APIs to probe</p>
            <p className="text-sm text-muted-foreground mb-6">
              Add at least one endpoint in Manage APIs (custom URLs). The built-in catalog is empty so you only monitor APIs you define.
            </p>
            <button
              type="button"
              onClick={() => setShowRegistryManager(true)}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              Manage APIs
            </button>
          </div>
        ) : !hasData ? (
          <DashboardSkeleton />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => (
              <ApiCard
                key={m.apiId}
                m={m}
                hasKey={apiKeyIds.has(m.apiId)}
                responseData={responseData[m.apiId]}
                expandedPreview={expandedPreview}
                onTogglePreview={handleTogglePreview}
              />
            ))}
          </div>
        )}
      </div>

      <ApiKeyManager
        apiKeys={apiKeys}
        onAddKey={handleAddKey}
        onRemoveKey={handleRemoveKey}
        isOpen={showKeyManager}
        onClose={() => setShowKeyManager(false)}
      />

      <ApiRegistryManager
        builtInApis={APIs}
        customApis={customApis}
        disabledApiIds={disabledApiIds}
        onToggleApi={handleToggleApi}
        onRemoveCustomApi={handleRemoveCustomApi}
        onAddCustomApi={handleAddCustomApi}
        onEditCustomApi={handleEditCustomApi}
        isOpen={showRegistryManager}
        onClose={() => setShowRegistryManager(false)}
      />

      <AnimatePresence>
        {showStatusBadge && metrics.length > 0 && (
          <ApiStatusBadge metrics={metrics} onClose={() => setShowStatusBadge(false)} />
        )}
      </AnimatePresence>
    </section>
  );
}
