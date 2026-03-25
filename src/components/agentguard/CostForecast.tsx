import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { TrendingUp, Loader2, Brain, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
}

type ForecastPoint = {
  date: string;
  actual?: number;
  predicted?: number;
};

export default function CostForecast({ userId }: Props) {
  const [data, setData] = useState<ForecastPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState("");
  const [predictedTotal, setPredictedTotal] = useState(0);
  const [trend, setTrend] = useState<"up" | "down" | "stable">("stable");

  useEffect(() => {
    generateForecast();
  }, [userId]);

  const generateForecast = async () => {
    setLoading(true);

    // Fetch historical cost data
    const { data: costData } = await supabase
      .from("cost_entries")
      .select("date, cost")
      .eq("user_id", userId)
      .order("date", { ascending: true });

    if (!costData || costData.length < 2) {
      setLoading(false);
      return;
    }

    // Group by date
    const dailyCosts: Record<string, number> = {};
    costData.forEach((entry) => {
      dailyCosts[entry.date] = (dailyCosts[entry.date] || 0) + Number(entry.cost);
    });

    const sortedDates = Object.keys(dailyCosts).sort();
    const values = sortedDates.map((d) => dailyCosts[d]);

    // Simple linear regression + exponential smoothing for forecast
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((acc, v, i) => acc + i * v, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Build actual data points
    const chartData: ForecastPoint[] = sortedDates.map((date, i) => ({
      date: date.slice(5), // MM-DD
      actual: Number(dailyCosts[date].toFixed(4)),
    }));

    // Generate 14-day forecast
    const lastDate = new Date(sortedDates[sortedDates.length - 1]);
    let forecastTotal = 0;
    for (let i = 1; i <= 14; i++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(futureDate.getDate() + i);
      const predicted = Math.max(0, intercept + slope * (n + i - 1));
      forecastTotal += predicted;
      chartData.push({
        date: `${String(futureDate.getMonth() + 1).padStart(2, "0")}-${String(futureDate.getDate()).padStart(2, "0")}`,
        predicted: Number(predicted.toFixed(4)),
      });
    }

    setData(chartData);
    setPredictedTotal(forecastTotal);
    setTrend(slope > 0.001 ? "up" : slope < -0.001 ? "down" : "stable");

    // Call AI for summary
    try {
      const response = await supabase.functions.invoke("cost-forecast-ai", {
        body: {
          historical_costs: values,
          dates: sortedDates,
          slope,
          predicted_14d_total: forecastTotal,
        },
      });
      if (response.data?.summary) {
        setSummary(response.data.summary);
      }
    } catch {
      setSummary(
        slope > 0
          ? `Spending is trending upward. Predicted 14-day cost: $${forecastTotal.toFixed(2)}. Consider reviewing agent limits.`
          : `Spending is stable or declining. Predicted 14-day cost: $${forecastTotal.toFixed(2)}.`
      );
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border">
        <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Not enough data</h3>
        <p className="text-muted-foreground text-sm">AI cost forecasting needs at least 2 days of cost data to generate predictions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold font-serif text-foreground">AI Cost Forecast</h3>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-5 border border-border"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={`w-4 h-4 ${trend === "up" ? "text-status-down" : trend === "down" ? "text-status-healthy" : "text-secondary"}`} />
            <span className="text-sm text-muted-foreground">Trend</span>
          </div>
          <p className="text-2xl font-bold font-mono text-foreground capitalize">{trend}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card rounded-xl p-5 border border-border"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">14-Day Forecast</span>
          </div>
          <p className="text-2xl font-bold font-mono text-primary">${predictedTotal.toFixed(2)}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-5 border border-border"
        >
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground">AI Insight</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{summary || "Analyzing..."}</p>
        </motion.div>
      </div>

      {/* Forecast chart */}
      <div className="glass-card rounded-xl p-6 border border-border">
        <h4 className="text-sm font-semibold text-foreground mb-4">Historical + Predicted Spend</h4>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(34, 80%, 56%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(34, 80%, 56%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="predictedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(195, 50%, 45%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(195, 50%, 45%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(225, 10%, 50%)" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(225, 10%, 50%)" }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{
                background: "hsl(225, 14%, 9%)",
                border: "1px solid hsl(225, 10%, 16%)",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(40, 20%, 95%)" }}
            />
            <Area type="monotone" dataKey="actual" stroke="hsl(34, 80%, 56%)" fill="url(#actualGrad)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="predicted" stroke="hsl(195, 50%, 45%)" fill="url(#predictedGrad)" strokeWidth={2} strokeDasharray="6 3" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-primary rounded" />
            Actual
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-secondary rounded border-dashed" style={{ borderTop: "2px dashed hsl(195, 50%, 45%)" }} />
            Predicted
          </div>
        </div>
      </div>
    </div>
  );
}
