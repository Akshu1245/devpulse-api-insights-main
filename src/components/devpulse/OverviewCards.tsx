import { RefreshCw, Shield, AlertTriangle, DollarSign, Activity } from "lucide-react";
import {
  useUserScans,
  useAlerts,
  useLLMSummary,
  useCompliance,
} from "@/lib/apiHooks";

type Props = { userId: string; refreshKey?: number };

export default function OverviewCards({ userId, refreshKey = 0 }: Props) {
  const { data: scansData, isLoading: scansLoading, error: scansError } = useUserScans(userId);
  const { data: alertsData } = useAlerts(userId);
  const { data: summaryData } = useLLMSummary(userId);
  const { data: complianceData } = useCompliance(userId);

  const isLoading = scansLoading;
  const error = scansError?.message;

  // Derive metrics from cached data
  const scans = scansData?.scans || [];
  const uniqueEndpoints = new Set(scans.map((row: { endpoint?: string }) => String(row.endpoint || "")));
  const vuln = scans.filter((row: { risk_level?: string }) => {
    const r = String(row.risk_level || "").toLowerCase();
    return r === "critical" || r === "high";
  }).length;

  const summary = summaryData as { cost_this_month_inr?: number } | undefined;
  const checks = complianceData?.checks || [];
  const compliant = checks.filter((c: { status?: string }) => String(c.status) === "compliant").length;
  const pct = checks.length ? Math.round((compliant / checks.length) * 100) : 0;

  const metrics = {
    apisMonitored: uniqueEndpoints.size,
    vulnerabilities: vuln,
    llmCostMonth: Number(summary?.cost_this_month_inr ?? 0),
    compliancePct: pct,
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rounded-xl p-4 sm:p-5 border border-border animate-pulse">
            <div className="h-4 w-24 bg-muted/40 rounded mb-3" />
            <div className="h-8 w-16 bg-muted/30 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-xl p-6 border border-status-down/25 mb-8 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <p className="text-sm text-status-down">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const items = [
    { label: "APIs monitored", value: String(metrics.apisMonitored), icon: Shield, color: "text-primary" },
    { label: "High / critical findings", value: String(metrics.vulnerabilities), icon: AlertTriangle, color: "text-status-down" },
    { label: "LLM cost (this month, ₹)", value: metrics.llmCostMonth.toFixed(2), icon: DollarSign, color: "text-secondary" },
    { label: "Compliance score", value: `${metrics.compliancePct}%`, icon: Activity, color: "text-status-healthy" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
      {items.map((item) => (
        <div key={item.label} className="glass-card rounded-xl p-4 sm:p-5 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <item.icon className={`w-4 h-4 ${item.color}`} />
            <span className="text-xs sm:text-sm text-muted-foreground">{item.label}</span>
          </div>
          <p className={`text-2xl sm:text-3xl font-bold font-mono ${item.color}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}
