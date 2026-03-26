import { useCallback, useEffect, useState } from "react";
import { Shield, AlertTriangle, DollarSign, Loader2, RefreshCw, TrendingUp, Zap } from "lucide-react";
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
  breakdown: {
    security_contribution: number;
    cost_contribution: number;
  };
};

const riskColor = (level: string) => {
  switch (level?.toLowerCase()) {
    case "critical": return "text-red-400 bg-red-400/10 border-red-400/30";
    case "high": return "text-orange-400 bg-orange-400/10 border-orange-400/30";
    case "medium": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
    case "low": return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    default: return "text-green-400 bg-green-400/10 border-green-400/30";
  }
};

const gradeColor = (grade: string) => {
  switch (grade) {
    case "A": return "text-green-400";
    case "B": return "text-blue-400";
    case "C": return "text-yellow-400";
    case "D": return "text-orange-400";
    case "F": return "text-red-400";
    default: return "text-muted-foreground";
  }
};

export default function UnifiedRiskScorePanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<RiskScore[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getUnifiedRiskScore() as { scores: RiskScore[] };
      setScores(res.scores || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load risk scores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Computing unified risk scores…
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
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold font-serif text-foreground">Unified Risk Score</h2>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
            Patent 1
          </span>
        </div>
        <button onClick={() => void load()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Combines API security vulnerability severity with LLM cost anomaly data into one unified risk score per endpoint.
        Formula: (60% security risk) + (40% cost anomaly risk) = Unified Risk Score.
      </p>

      {scores.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No risk scores yet</p>
          <p className="text-xs mt-1">
            Scan API endpoints and log LLM usage to generate unified risk scores.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scores.map((score, i) => (
            <div key={i} className={`rounded-xl border p-4 ${riskColor(score.risk_level)}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-muted-foreground truncate">{score.endpoint}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${riskColor(score.risk_level)}`}>
                      {score.risk_level.toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">{score.action_required}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold">{score.unified_risk_score}</p>
                  <p className="text-xs text-muted-foreground">/ 100</p>
                </div>
              </div>

              {/* Risk breakdown bar */}
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    score.unified_risk_score >= 75 ? "bg-red-400" :
                    score.unified_risk_score >= 50 ? "bg-orange-400" :
                    score.unified_risk_score >= 25 ? "bg-yellow-400" :
                    "bg-green-400"
                  }`}
                  style={{ width: `${score.unified_risk_score}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">Security:</span>
                  <span className={`font-bold ${gradeColor(score.security.grade)}`}>
                    {score.security.grade} ({score.security.score}/100)
                  </span>
                  {score.security.vulnerability_count > 0 && (
                    <span className="text-muted-foreground">
                      · {score.security.vulnerability_count} vuln{score.security.vulnerability_count > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">Cost:</span>
                  <span className={`font-bold ${score.cost_anomaly.is_anomaly ? "text-orange-400" : "text-green-400"}`}>
                    {score.cost_anomaly.is_anomaly ? `${score.cost_anomaly.anomaly_ratio}x anomaly` : "Normal"}
                  </span>
                  {score.cost_anomaly.cost_share_pct > 0 && (
                    <span className="text-muted-foreground">· {score.cost_anomaly.cost_share_pct}% of budget</span>
                  )}
                </div>
              </div>

              {/* OWASP categories */}
              {score.security.owasp_categories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {score.security.owasp_categories.map((cat) => (
                    <span key={cat.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-border">
                      {cat.owasp_id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
