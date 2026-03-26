import { useCallback, useEffect, useState } from "react";
import { Brain, TrendingUp, AlertTriangle, Loader2, RefreshCw, Zap, DollarSign } from "lucide-react";
import { api } from "@/lib/api";

type ThinkingStats = {
  total_calls: number;
  calls_with_thinking: number;
  thinking_call_rate_pct: number;
  total_thinking_tokens: number;
  total_thinking_cost_inr: number;
  total_cost_inr: number;
  avg_thinking_overhead: number;
  anomaly_calls: number;
  potential_savings_inr: number;
};

type EndpointBreakdown = {
  endpoint: string;
  calls: number;
  thinking_tokens: number;
  thinking_cost_inr: number;
  total_cost_inr: number;
  anomaly_calls: number;
};

type Analysis = {
  total_cost_inr: number;
  thinking_cost_inr: number;
  thinking_cost_pct: number;
  top_cost_endpoint: string;
  top_cost_endpoint_pct: number;
  recommendations: Array<{
    priority: string;
    type: string;
    message: string;
    potential_savings_inr?: number;
    endpoint?: string;
    anomaly_count?: number;
  }>;
  potential_monthly_savings_inr: number;
};

type Props = { userId: string };

export default function ThinkingTokenPanel({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ThinkingStats | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointBreakdown[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, analysisRes] = await Promise.all([
        api.getThinkingTokenStats(userId) as Promise<{ stats: ThinkingStats; endpoint_breakdown: EndpointBreakdown[] }>,
        api.analyzeThinkingEfficiency(userId) as Promise<Analysis>,
      ]);
      setStats(statsRes.stats);
      setEndpoints(statsRes.endpoint_breakdown || []);
      setAnalysis(analysisRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load thinking token data");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const priorityColor = (p: string) => {
    switch (p?.toUpperCase()) {
      case "CRITICAL": return "text-red-400 bg-red-400/10 border-red-400/30";
      case "HIGH": return "text-orange-400 bg-orange-400/10 border-orange-400/30";
      case "MEDIUM": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      default: return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading thinking token analysis…
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl border border-border p-6">
        <div className="text-sm text-status-down mb-3">{error}</div>
        <button onClick={() => void load()} className="text-xs text-primary hover:underline flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold font-serif text-foreground">Thinking Token Attribution</h2>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
            Patent 2
          </span>
        </div>
        <button onClick={() => void load()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Detects hidden thinking/reasoning tokens in OpenAI o1/o3 and Anthropic Claude extended thinking calls.
        Uses differential token analysis and response timing signatures.
      </p>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl bg-muted/20 border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Total LLM Calls</p>
            <p className="text-xl font-bold text-foreground">{stats.total_calls.toLocaleString()}</p>
          </div>
          <div className={`rounded-xl border p-3 ${stats.calls_with_thinking > 0 ? "bg-orange-500/10 border-orange-500/30" : "bg-muted/20 border-border"}`}>
            <p className="text-xs text-muted-foreground mb-1">With Thinking Tokens</p>
            <p className={`text-xl font-bold ${stats.calls_with_thinking > 0 ? "text-orange-400" : "text-foreground"}`}>
              {stats.calls_with_thinking}
              <span className="text-xs font-normal ml-1">({stats.thinking_call_rate_pct}%)</span>
            </p>
          </div>
          <div className={`rounded-xl border p-3 ${stats.avg_thinking_overhead > 3 ? "bg-red-500/10 border-red-500/30" : "bg-muted/20 border-border"}`}>
            <p className="text-xs text-muted-foreground mb-1">Avg Cost Overhead</p>
            <p className={`text-xl font-bold ${stats.avg_thinking_overhead > 3 ? "text-red-400" : "text-foreground"}`}>
              {stats.avg_thinking_overhead.toFixed(1)}x
            </p>
          </div>
          <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3">
            <p className="text-xs text-muted-foreground mb-1">Potential Savings</p>
            <p className="text-xl font-bold text-green-400">
              ₹{stats.potential_savings_inr.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis && analysis.recommendations && analysis.recommendations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Optimization Recommendations
          </h3>
          <div className="space-y-2">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className={`rounded-xl border p-3 ${priorityColor(rec.priority)}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${priorityColor(rec.priority)}`}>
                    {rec.priority}
                  </span>
                </div>
                <p className="text-sm">{rec.message}</p>
                {rec.potential_savings_inr && (
                  <p className="text-xs mt-1 opacity-80">
                    Potential savings: ₹{rec.potential_savings_inr.toFixed(2)}/month
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Endpoint Breakdown */}
      {endpoints.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            Cost by Endpoint
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-left text-muted-foreground">
                  <th className="p-3 font-medium">Endpoint / Feature</th>
                  <th className="p-3 font-medium">Calls</th>
                  <th className="p-3 font-medium">Thinking Tokens</th>
                  <th className="p-3 font-medium">Thinking Cost</th>
                  <th className="p-3 font-medium">Total Cost</th>
                  <th className="p-3 font-medium">Anomalies</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.slice(0, 10).map((ep, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-3 font-mono text-xs max-w-[200px] truncate">{ep.endpoint}</td>
                    <td className="p-3 text-muted-foreground">{ep.calls}</td>
                    <td className="p-3 text-muted-foreground">{ep.thinking_tokens.toLocaleString()}</td>
                    <td className="p-3">
                      <span className={ep.thinking_cost_inr > 10 ? "text-orange-400 font-medium" : "text-muted-foreground"}>
                        ₹{ep.thinking_cost_inr.toFixed(4)}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">₹{ep.total_cost_inr.toFixed(4)}</td>
                    <td className="p-3">
                      {ep.anomaly_calls > 0 ? (
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {ep.anomaly_calls}
                        </span>
                      ) : (
                        <span className="text-green-400 text-xs">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!stats || stats.total_calls === 0) && (
        <div className="text-center py-8 text-muted-foreground">
          <Brain className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No thinking token data yet</p>
          <p className="text-xs mt-1">
            Integrate the DevPulse SDK to start tracking thinking token costs per endpoint.
          </p>
          <div className="mt-4 p-3 rounded-xl bg-muted/20 border border-border text-left">
            <p className="text-xs font-mono text-muted-foreground">
              {`// Log LLM calls with thinking token attribution`}<br />
              {`await devpulse.logLLMCall({`}<br />
              {`  model: "o3-mini",`}<br />
              {`  endpoint: "/api/summarize",`}<br />
              {`  usage: response.usage,`}<br />
              {`  latency_ms: elapsed`}<br />
              {`});`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
import { Brain, TrendingUp, AlertTriangle, Loader2, RefreshCw, Zap, DollarSign } from "lucide-react";
import { api } from "@/lib/api";

type ThinkingStats = {
  total_calls: number;
  calls_with_thinking: number;
  thinking_call_rate_pct: number;
  total_thinking_tokens: number;
  total_thinking_cost_inr: number;
  total_cost_inr: number;
  avg_thinking_overhead: number;
  anomaly_calls: number;
  potential_savings_inr: number;
};

type EndpointBreakdown = {
  endpoint: string;
  calls: number;
  thinking_tokens: number;
  thinking_cost_inr: number;
  total_cost_inr: number;
  anomaly_calls: number;
};

type Analysis = {
  total_cost_inr: number;
  thinking_cost_inr: number;
  thinking_cost_pct: number;
  top_cost_endpoint: string;
  top_cost_endpoint_pct: number;
  recommendations: Array<{
    priority: string;
    type: string;
    message: string;
    potential_savings_inr?: number;
    endpoint?: string;
    anomaly_count?: number;
  }>;
  potential_monthly_savings_inr: number;
};

type Props = { userId: string };
