"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Code2, Copy, Check, Activity } from "lucide-react";
import { APIs } from "@/data/apiData";
import { useHealthStore } from "@/hooks/useHealthStore";

const MAX_SELECTION = 3;

function buildLiveTemplate(selectedApiIds: string[]) {
  const selectedApis = APIs.filter((api) => selectedApiIds.includes(api.id));
  const apiConfig = selectedApis.map((api) => ({
    id: api.id,
    name: api.name,
    testUrl: api.testUrl,
    requiresKey: api.requiresKey,
  }));

  return `// Live integration report fetcher
// Generated at: ${new Date().toISOString()}

const apis = ${JSON.stringify(apiConfig, null, 2)};

function applyApiKey(url, key) {
  if (!key) return url;
  return url
    .replace(/api_key=[^&]+/, \`api_key=\${encodeURIComponent(key)}\`)
    .replace(/apikey=[^&]+/, \`apikey=\${encodeURIComponent(key)}\`)
    .replace(/appid=[^&]+/, \`appid=\${encodeURIComponent(key)}\`)
    .replace(/key=[^&]+/, \`key=\${encodeURIComponent(key)}\`);
}

export async function getLiveReport(userApiKeys = {}) {
  const startAt = Date.now();

  const checks = await Promise.allSettled(
    apis.map(async (api) => {
      const url = api.requiresKey
        ? applyApiKey(api.testUrl, userApiKeys[api.id])
        : api.testUrl;

      const started = performance.now();
      const res = await fetch(url);
      const latencyMs = Math.round(performance.now() - started);

      return {
        apiId: api.id,
        apiName: api.name,
        ok: res.ok,
        statusCode: res.status,
        latencyMs,
        checkedAt: new Date().toISOString(),
      };
    })
  );

  const results = checks.map((item, index) => {
    if (item.status === "fulfilled") return item.value;
    return {
      apiId: apis[index].id,
      apiName: apis[index].name,
      ok: false,
      statusCode: 0,
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      error: String(item.reason),
    };
  });

  const healthy = results.filter((r) => r.ok).length;
  const degraded = results.length - healthy;
  const avgLatencyMs = results.length
    ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startAt,
    summary: { total: results.length, healthy, degraded, avgLatencyMs },
    results,
  };
}
`;
}

export default function CodeGenerator() {
  const [copied, setCopied] = useState(false);
  const [selectedApis, setSelectedApis] = useState<string[]>(["usgs", "openmeteo"]);
  const { metrics } = useHealthStore();

  const selectedMetrics = useMemo(
    () => metrics.filter((m) => selectedApis.includes(m.apiId)),
    [metrics, selectedApis]
  );

  const template = useMemo(() => buildLiveTemplate(selectedApis), [selectedApis]);

  const liveSummary = useMemo(() => {
    if (selectedMetrics.length === 0) {
      return { healthy: 0, degraded: 0, avgLatency: 0 };
    }
    const healthy = selectedMetrics.filter((m) => m.status === "healthy").length;
    const degraded = selectedMetrics.length - healthy;
    const avgLatency = Math.round(
      selectedMetrics.reduce((sum, m) => sum + m.latencyMs, 0) / selectedMetrics.length
    );
    return { healthy, degraded, avgLatency };
  }, [selectedMetrics]);

  const handleCopy = () => {
    navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleApi = (id: string) => {
    setSelectedApis((prev) => {
      if (prev.includes(id)) {
        return prev.filter((apiId) => apiId !== id);
      }
      return [...prev, id].slice(0, MAX_SELECTION);
    });
  };

  return (
    <section id="codegen" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-accent" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
              Live <span className="text-accent">Code Generator</span>
            </h2>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl font-light">
            Build runtime integration code directly from live API selections and current probe status.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
              Select Live APIs (max {MAX_SELECTION})
            </h3>
            <div className="flex flex-wrap gap-2">
              {APIs.map((api) => (
                <button
                  key={api.id}
                  onClick={() => toggleApi(api.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    selectedApis.includes(api.id)
                      ? "bg-accent/15 text-accent border border-accent/25"
                      : "glass-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {api.name}
                </button>
              ))}
            </div>

            <div className="glass-card rounded-xl p-4 border border-border mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Live Report Snapshot</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Healthy: {liveSummary.healthy} · Degraded/Down: {liveSummary.degraded} · Avg Latency: {liveSummary.avgLatency}ms
              </p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-3 glass-card rounded-2xl border border-border/50 overflow-hidden float-card"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
              <span className="text-xs text-muted-foreground font-mono">javascript · live-report</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/20"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="p-5 text-sm font-mono leading-relaxed overflow-x-auto text-foreground/80">
              <code>{template}</code>
            </pre>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
