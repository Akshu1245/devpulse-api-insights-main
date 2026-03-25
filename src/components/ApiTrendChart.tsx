import { useMemo, memo } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface TrendPoint {
  time: string;
  latency: number;
  status: number;
}

interface Props {
  apiName: string;
  data: TrendPoint[];
  isExpanded: boolean;
  onToggle: () => void;
}

export default memo(function ApiTrendChart({ apiName, data, isExpanded, onToggle }: Props) {
  const { trend, avgLatency, maxLatency, minLatency } = useMemo(() => {
    if (!data.length) return { trend: "stable" as const, avgLatency: 0, maxLatency: 0, minLatency: 0 };
    
    const avg = Math.round(data.reduce((s, d) => s + d.latency, 0) / data.length);
    const max = Math.max(...data.map(d => d.latency));
    const min = Math.min(...data.map(d => d.latency));
    
    let trend: "up" | "down" | "stable" = "stable";
    if (data.length >= 2) {
      const recent = data.slice(-5);
      const avgRecent = recent.reduce((s, d) => s + d.latency, 0) / recent.length;
      const older = data.slice(0, 5);
      const avgOlder = older.reduce((s, d) => s + d.latency, 0) / older.length;
      if (avgRecent > avgOlder * 1.2) trend = "up";
      else if (avgRecent < avgOlder * 0.8) trend = "down";
    }
    
    return { trend, avgLatency: avg, maxLatency: max, minLatency: min };
  }, [data]);

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-status-down" : trend === "down" ? "text-status-healthy" : "text-secondary";
  const trendLabel = trend === "up" ? "Increasing" : trend === "down" ? "Decreasing" : "Stable";

  return (
    <div className="glass-card-hover gradient-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse-soft" />
          <span className="font-semibold text-foreground text-sm">{apiName}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
            <span className={`text-xs font-mono ${trendColor}`}>{trendLabel}</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">{avgLatency}ms avg</span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="text-muted-foreground text-xs"
          >
            ▼
          </motion.span>
        </div>
      </button>

      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="px-4 pb-4"
        >
          <div className="flex gap-4 mb-3">
            {[
              { label: "Avg", value: `${avgLatency}ms`, color: "text-secondary" },
              { label: "Min", value: `${minLatency}ms`, color: "text-status-healthy" },
              { label: "Max", value: `${maxLatency}ms`, color: "text-status-down" },
              { label: "Points", value: `${data.length}`, color: "text-muted-foreground" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className={`text-sm font-mono font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-${apiName}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(34, 80%, 56%)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(34, 80%, 56%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{ fill: "hsl(225, 10%, 50%)", fontSize: 10 }}
                  axisLine={{ stroke: "hsl(225, 10%, 16%)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "hsl(225, 10%, 50%)", fontSize: 10 }}
                  axisLine={{ stroke: "hsl(225, 10%, 16%)" }}
                  tickLine={false}
                  unit="ms"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(225, 14%, 9%)",
                    border: "1px solid hsl(34, 80%, 56%, 0.15)",
                    borderRadius: "12px",
                    color: "hsl(40, 20%, 95%)",
                    fontSize: 12,
                    fontFamily: "DM Mono",
                  }}
                  labelStyle={{ color: "hsl(225, 10%, 50%)" }}
                />
                <Area
                  type="monotone"
                  dataKey="latency"
                  stroke="hsl(34, 80%, 56%)"
                  strokeWidth={2}
                  fill={`url(#gradient-${apiName})`}
                  dot={false}
                  activeDot={{ r: 4, stroke: "hsl(34, 80%, 56%)", fill: "hsl(225, 14%, 9%)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}
    </div>
  );
});
