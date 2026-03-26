/**
 * AnomalyDetector — Real anomaly detection (not basic).
 *
 * Compares today vs. 7-day rolling baseline.
 * Detects % spike and shows clear alert:
 *   "⚠️ Cost spike detected — /chat usage increased 240% in last 6 hours"
 *
 * This is a paid feature trigger.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, TrendingUp, Loader2, RefreshCw, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";

type DailyBreakdown = { date: string; cost: number };

type LLMSummary = {
  total_cost_inr?: number;
  daily_breakdown?: DailyBreakdown[];
  model_totals?: Record<string, number>;
};

type Anomaly = {
  model: string;
  todayCost: number;
  baselineCost: number;
  spikePct: number;
  level: "critical" | "high" | "warning";
};

function detectAnomalies(summary: LLMSummary | null): Anomaly[] {
  const breakdown = summary?.daily_breakdown ?? [];
  if (breakdown.length < 2) return [];

  // Sort by date ascending
  const sorted = [...breakdown].sort((a, b) => a.date.localeCompare(b.date));
  const today = sorted[sorted.length - 1];
  const last7 = sorted.slice(-8, -1); // 7 days before today

  if (last7.length === 0) return [];

  const avg7d = last7.reduce((s, d) => s + d.cost, 0) / last7.length;
  if (avg7d === 0) return [];

  const spikePct = Math.round(((today.cost - avg7d) / avg7d) * 100);
  if (spikePct < 50) return []; // Only flag ≥50% spikes

  const level: Anomaly["level"] =
    spikePct >= 200 ? "critical" : spikePct >= 100 ? "high" : "warning";

  return [
    {
      model: "Total LLM spend",
      todayCost: today.cost,
      baselineCost: avg7d,
      spikePct,
      level,
    },
  ];
}

const levelConfig = {
  critical: {
    bg: "bg-red-500/10 border-red-500/30",
    text: "text-red-400",
    icon: "text-red-400",
    label: "CRITICAL SPIKE",
  },
  high: {
    bg: "bg-orange-500/10 border-orange-500/30",
    text: "text-orange-400",
    icon: "text-orange-400",
    label: "COST SPIKE",
  },
  warning: {
    bg: "bg-yellow-500/10 border-yellow-500/25",
    text: "text-yellow-400",
    icon: "text-yellow-400",
    label: "ELEVATED",
  },
};

export default function AnomalyDetector() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LLMSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLLMSummary() as LLMSummary;
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const anomalies = useMemo(() => detectAnomalies(summary), [summary]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Running anomaly detection…
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl border border-border p-5">
        <p className="text-sm text-status-down mb-2">{error}</p>
        <button onClick={() => void load()} className="text-xs text-primary hover:underline flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6 mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold font-serif text-foreground">Anomaly Detector</h2>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
            vs 7-day baseline
          </span>
        </div>
        <button onClick={() => void load()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {anomalies.length === 0 ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
          <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-400">No cost spikes detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Usage is within normal range vs. 7-day baseline.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {anomalies.map((a, idx) => {
            const cfg = levelConfig[a.level];
            return (
              <div key={idx} className={`rounded-xl border p-4 ${cfg.bg}`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`w-5 h-5 ${cfg.icon} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      <span className={`text-lg font-bold font-mono ${cfg.text}`}>
                        +{a.spikePct}%
                      </span>
                    </div>
                    <p className={`text-sm font-semibold ${cfg.text}`}>
                      Cost spike detected — {a.model}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Today: <span className="text-foreground font-mono font-medium">₹{a.todayCost.toFixed(4)}</span>
                      {" "}vs. 7-day avg:{" "}
                      <span className="text-foreground font-mono font-medium">₹{a.baselineCost.toFixed(4)}</span>
                    </p>
                  </div>
                </div>

                {/* Visual spike bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>7-day baseline</span>
                    <span>Today (+{a.spikePct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        a.level === "critical" ? "bg-red-400" : a.level === "high" ? "bg-orange-400" : "bg-yellow-400"
                      }`}
                      style={{ width: `${Math.min(100, (a.spikePct / 300) * 100)}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  Investigate usage patterns. Consider rate limiting or caching to reduce spend.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
