/**
 * WasteWatchBanner — The conversion hook.
 *
 * Shows "You are wasting ₹X/month on inefficient API usage" at the top of the dashboard.
 * Pulls from LLM cost + risk score data to compute the estimate.
 * Converts browsers → paid users.
 */
import { useCallback, useEffect, useState } from "react";
import { TrendingDown, X } from "lucide-react";
import { api } from "@/lib/api";

type LLMSummary = {
  total_cost_inr?: number;
};

type RiskResult = {
  scores?: Array<{
    risk_level: string;
    cost_anomaly: { cost_share_pct: number; is_anomaly: boolean };
  }>;
};

export default function WasteWatchBanner() {
  const [wasteAmount, setWasteAmount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const compute = useCallback(async () => {
    try {
      const [llmRes, riskRes] = await Promise.all([
        api.getLLMSummary() as Promise<LLMSummary>,
        api.getUnifiedRiskScore() as Promise<RiskResult>,
      ]);

      const totalInr = llmRes?.total_cost_inr ?? 0;
      if (totalInr === 0) {
        setLoaded(true);
        return;
      }

      // Sum cost share for anomalous high/critical endpoints
      const anomalousPct = (riskRes?.scores ?? [])
        .filter((s) => s.cost_anomaly.is_anomaly && ["critical", "high"].includes(s.risk_level.toLowerCase()))
        .reduce((sum, s) => sum + s.cost_anomaly.cost_share_pct, 0);

      // Conservative: 60% of anomalous spend is "waste"
      const waste = (anomalousPct / 100) * totalInr * 0.6;
      setWasteAmount(waste > 10 ? waste : null); // Only show if meaningful
    } catch {
      // Silently skip — banner is non-critical
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void compute();
  }, [compute]);

  if (!loaded || wasteAmount === null || dismissed) return null;

  return (
    <div className="relative flex items-center gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/25 mb-6">
      <TrendingDown className="w-5 h-5 text-orange-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-orange-400">
          You are wasting{" "}
          <span className="text-base font-bold text-orange-300">
            ₹{Math.round(wasteAmount).toLocaleString("en-IN")}/month
          </span>{" "}
          on inefficient API usage
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Based on cost anomalies and security findings. Fix the top issues below to reclaim this spend.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
