/**
 * InsightEngine — The "WTF moment" component.
 *
 * Transforms raw scan + cost data into actionable, money-saving insights.
 * Each card surfaces: Risk level · Cost (₹/day) · Impact (% of spend) · Savings action
 *
 * This is what turns DevPulse from a "data tool" → "decision tool".
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, TrendingDown, Zap, DollarSign, Loader2, RefreshCw, ChevronRight, ArrowDown } from "lucide-react";
import { api } from "@/lib/api";

type RiskScore = {
  endpoint: string;
  unified_risk_score: number;
  risk_level: string;
  action_required: string;
  security: {
    score: number;
    grade: string;
    vulnerability_count: number;
    critical_count: number;
    high_count: number;
    owasp_categories: Array<{ id: string; name: string; owasp_id: string }>;
  };
  cost_anomaly: {
    anomaly_ratio: number;
    cost_share_pct: number;
    is_anomaly: boolean;
    anomaly_level: string;
  };
};

type LLMSummary = {
  total_cost_inr?: number;
  model_totals?: Record<string, number>;
  daily_breakdown?: { date: string; cost: number }[];
};

type Insight = {
  endpoint: string;
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  costPerDay: number;
  impactPct: number;
  savingsPerMonth: number;
  action: string;
  confidence: number;
  isAnomaly: boolean;
  anomalyRatio: number;
};

const riskBadge: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-400/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-400/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-400/30",
  low: "bg-blue-500/15 text-blue-400 border-blue-400/30",
};

const riskCardBorder: Record<string, string> = {
  critical: "border-red-500/30",
  high: "border-orange-500/30",
  medium: "border-yellow-500/20",
  low: "border-border",
};

function buildInsights(scores: RiskScore[], llmSummary: LLMSummary | null): Insight[] {
  const totalCostInr = llmSummary?.total_cost_inr ?? 0;
  // 30-day total → daily average
  const avgDailyCostInr = totalCostInr > 0 ? totalCostInr / 30 : 0;

  return scores
    .filter((s) => ["critical", "high"].includes(s.risk_level.toLowerCase()))
    .map((s) => {
      const sharePct = s.cost_anomaly.cost_share_pct ?? 0;
      const costPerDay = (sharePct / 100) * avgDailyCostInr;
      const savingsPerMonth = costPerDay * 30 * 0.6; // conservative 60% reduction if fixed

      // Confidence heuristic: higher score = higher confidence (70–97 range)
      const confidence = Math.min(97, 70 + Math.round(s.unified_risk_score * 0.27));

      // Derive a clear action string
      let action = s.action_required || "Fix security misconfiguration";
      if (s.cost_anomaly.is_anomaly && s.cost_anomaly.anomaly_ratio > 1.5) {
        action = `Reduce calls — ${s.cost_anomaly.anomaly_ratio.toFixed(1)}× above baseline`;
      } else if (s.security.critical_count > 0) {
        action = `Fix ${s.security.critical_count} critical vuln${s.security.critical_count > 1 ? "s" : ""}`;
      } else if (s.security.high_count > 0) {
        action = `Patch ${s.security.high_count} high-severity issue${s.security.high_count > 1 ? "s" : ""}`;
      }

      return {
        endpoint: s.endpoint,
        riskScore: s.unified_risk_score,
        riskLevel: s.risk_level.toLowerCase() as Insight["riskLevel"],
        costPerDay,
        impactPct: sharePct,
        savingsPerMonth,
        action,
        confidence,
        isAnomaly: s.cost_anomaly.is_anomaly,
        anomalyRatio: s.cost_anomaly.anomaly_ratio,
      } satisfies Insight;
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 3); // Top 3 — noise reduction
}

type Props = { userId: string };

export default function InsightEngine({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [totalWaste, setTotalWaste] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [riskRes, llmRes] = await Promise.all([
        api.getUnifiedRiskScore(userId) as Promise<{ scores: RiskScore[] }>,
        api.getLLMSummary(userId) as Promise<LLMSummary>,
      ]);

      const scores = riskRes?.scores ?? [];
      const built = buildInsights(scores, llmRes);
      setInsights(built);
      setTotalWaste(built.reduce((s, i) => s + i.savingsPerMonth, 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Generating decision insights…</span>
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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold font-serif text-foreground">Insight Engine</h2>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
            Decision Layer
          </span>
        </div>
        <button onClick={() => void load()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Top actions ranked by impact. Fixing these saves you real money.
      </p>

      {/* Aggregate savings callout */}
      {totalWaste > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/25 mb-5">
          <TrendingDown className="w-5 h-5 text-orange-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-400">
              Fix the top {insights.length} issue{insights.length > 1 ? "s" : ""} below → save up to{" "}
              <span className="text-lg">₹{totalWaste.toFixed(0)}/month</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Conservative 60% reduction estimate based on current usage patterns.
            </p>
          </div>
        </div>
      )}

      {insights.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No high-impact issues found</p>
          <p className="text-xs mt-1">
            Run the API scanner and log LLM usage to generate insights.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, idx) => (
            <div
              key={insight.endpoint}
              className={`rounded-xl border p-4 bg-card/50 ${riskCardBorder[insight.riskLevel] || "border-border"}`}
            >
              {/* Rank + Endpoint */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-xs font-bold text-muted-foreground mt-0.5 w-5 shrink-0">#{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-foreground truncate font-medium">{insight.endpoint}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${riskBadge[insight.riskLevel] || riskBadge.low}`}>
                        {insight.riskLevel.toUpperCase()} {insight.riskScore}/100
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Confidence: <span className="text-foreground font-medium">{insight.confidence}%</span>
                      </span>
                      {insight.isAnomaly && (
                        <span className="text-xs bg-orange-500/15 text-orange-400 px-1.5 py-0.5 rounded border border-orange-400/25">
                          ⚠️ {insight.anomalyRatio.toFixed(1)}× spike
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Big number: risk score */}
                <div className="text-right shrink-0">
                  <p className={`text-2xl font-bold ${riskBadge[insight.riskLevel]?.split(" ")[1] ?? "text-foreground"}`}>
                    {insight.riskScore}
                  </p>
                  <p className="text-[10px] text-muted-foreground">risk / 100</p>
                </div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-muted/20 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                    <DollarSign className="w-3 h-3" /> Cost/day
                  </p>
                  <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                    {insight.costPerDay > 0 ? `₹${insight.costPerDay.toFixed(0)}` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/20 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Impact</p>
                  <p className="text-sm font-bold font-mono text-primary mt-0.5">
                    {insight.impactPct > 0 ? `${insight.impactPct.toFixed(0)}%` : "—"}
                  </p>
                  <p className="text-[9px] text-muted-foreground">of total spend</p>
                </div>
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2 text-center">
                  <p className="text-[10px] text-green-400">Save/month</p>
                  <p className="text-sm font-bold font-mono text-green-400 mt-0.5">
                    {insight.savingsPerMonth > 0 ? `₹${insight.savingsPerMonth.toFixed(0)}` : "—"}
                  </p>
                </div>
              </div>

              {/* Action CTA */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/15">
                <ArrowDown className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs text-foreground">
                  <span className="font-semibold text-primary">Action: </span>
                  {insight.action}
                </p>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
