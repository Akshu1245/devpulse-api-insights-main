import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";

type Props = { userId: string };

type Summary = {
  total_tokens?: number;
  total_cost_inr?: number;
  most_expensive_model?: string | null;
  daily_breakdown?: { date: string; cost: number }[];
  model_totals?: Record<string, number>;
};

export default function LLMCostPanel({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLLMSummary(userId);
      setSummary(data as Summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load LLM usage");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(() => {
    const raw = summary?.daily_breakdown || [];
    return raw.map((d) => ({
      ...d,
      label: d.date.slice(5),
    }));
  }, [summary]);

  const modelRows = useMemo(() => {
    const mt = summary?.model_totals || {};
    return Object.entries(mt)
      .map(([model, cost]) => ({ model, cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [summary]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading LLM usage…
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl border border-status-down/25 p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <p className="text-sm text-status-down">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const empty = !summary?.total_tokens && !summary?.total_cost_inr;

  if (empty) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 text-center text-muted-foreground text-sm">
        No LLM usage logged yet. Use{" "}
        <code className="text-xs bg-muted/40 px-1.5 py-0.5 rounded">POST /llm/log</code> on the backend (or your app) to start tracking.
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold font-serif text-foreground">LLM cost intelligence</h2>
          <p className="text-sm text-muted-foreground mt-1">Totals and daily spend (₹) for the last 30 days.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Total tokens</p>
          <p className="text-2xl font-mono font-semibold text-foreground">{summary?.total_tokens ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Total cost (₹)</p>
          <p className="text-2xl font-mono font-semibold text-primary">{(summary?.total_cost_inr ?? 0).toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Top model by spend</p>
          <p className="text-lg font-mono text-foreground truncate">{summary?.most_expensive_model || "—"}</p>
        </div>
      </div>

      <div className="h-56 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={40} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [`₹${value.toFixed(4)}`, "Cost"]}
            />
            <Line type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-2">Spend by model</h3>
        {modelRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No per-model breakdown.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-left text-muted-foreground">
                  <th className="p-3 font-medium">Model</th>
                  <th className="p-3 font-medium">Total ₹</th>
                </tr>
              </thead>
              <tbody>
                {modelRows.map((r) => (
                  <tr key={r.model} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{r.model}</td>
                    <td className="p-3 font-mono">{r.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
