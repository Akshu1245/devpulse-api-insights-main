/**
 * CostDistributionPanel — The "WTF moment" for cost.
 *
 * Shows:
 *   Top 3 expensive models/endpoints with % of total spend
 *   Visual distribution bar
 *   "Fix this → save ₹X/month" per item
 *
 * This is what creates the "WTF, /chat costs 73%?" moment.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign, Loader2, RefreshCw, TrendingUp, Crown } from "lucide-react";
import { api } from "@/lib/api";

type LLMSummary = {
  total_cost_inr?: number;
  model_totals?: Record<string, number>;
};

type CostDriver = {
  name: string;
  costInr: number;
  pct: number;
  rank: number;
};

const RANK_COLORS = [
  "bg-red-400",
  "bg-orange-400",
  "bg-yellow-400",
];

const RANK_TEXT = [
  "text-red-400",
  "text-orange-400",
  "text-yellow-400",
];

type Props = { userId: string };

export default function CostDistributionPanel({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LLMSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLLMSummary(userId) as LLMSummary;
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cost data");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const drivers: CostDriver[] = useMemo(() => {
    const totals = summary?.model_totals ?? {};
    const total = summary?.total_cost_inr ?? Object.values(totals).reduce((s, v) => s + v, 0);
    if (total === 0) return [];

    return Object.entries(totals)
      .map(([name, cost]) => ({
        name,
        costInr: cost,
        pct: Math.round((cost / total) * 100),
        rank: 0,
      }))
      .sort((a, b) => b.costInr - a.costInr)
      .slice(0, 3)
      .map((d, i) => ({ ...d, rank: i + 1 }));
  }, [summary]);

  const totalCostInr = summary?.total_cost_inr ?? 0;

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading cost distribution…
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl border border-border p-6">
        <p className="text-sm text-status-down mb-3">{error}</p>
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
          <DollarSign className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold font-serif text-foreground">Cost Distribution</h2>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
            Top Spenders
          </span>
        </div>
        <button onClick={() => void load()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {drivers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <DollarSign className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No cost data yet</p>
          <p className="text-xs mt-1">Log LLM usage via <code className="text-xs bg-muted/40 px-1 rounded">POST /llm/log</code> to see distribution.</p>
        </div>
      ) : (
        <>
          {/* Distribution strip */}
          <div className="h-3 rounded-full overflow-hidden flex mb-4">
            {drivers.map((d, i) => (
              <div
                key={d.name}
                className={`${RANK_COLORS[i]} h-full transition-all`}
                style={{ width: `${d.pct}%` }}
                title={`${d.name}: ${d.pct}%`}
              />
            ))}
            <div className="flex-1 bg-muted/30" />
          </div>

          {/* Top cost drivers */}
          <div className="space-y-3">
            {drivers.map((d, i) => {
              const savingsPerMonth = d.costInr * 0.4; // 40% reduction potential
              return (
                <div
                  key={d.name}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/10 border border-border"
                >
                  {/* Rank badge */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${RANK_COLORS[i]}/20`}>
                    {i === 0 ? (
                      <Crown className={`w-3.5 h-3.5 ${RANK_TEXT[i]}`} />
                    ) : (
                      <span className={`text-xs font-bold ${RANK_TEXT[i]}`}>{d.rank}</span>
                    )}
                  </div>

                  {/* Name + bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-mono font-medium text-foreground truncate">{d.name}</p>
                      <span className={`text-sm font-bold ${RANK_TEXT[i]}`}>{d.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className={`${RANK_COLORS[i]} h-full rounded-full`}
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Cost + savings */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-bold text-foreground">₹{d.costInr.toFixed(2)}</p>
                    <p className="text-[10px] text-green-400 flex items-center gap-0.5 justify-end">
                      <TrendingUp className="w-2.5 h-2.5" />
                      Save ₹{savingsPerMonth.toFixed(0)}/mo
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          {totalCostInr > 0 && (
            <div className="mt-4 pt-3 border-t border-border flex justify-between text-sm">
              <span className="text-muted-foreground">30-day total</span>
              <span className="font-mono font-semibold text-foreground">₹{totalCostInr.toFixed(2)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
