import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Loader2, Cpu, Coins, Zap } from "lucide-react";

const COLORS = ["hsl(34 80% 56%)", "hsl(195 50% 45%)", "hsl(160 45% 48%)", "hsl(4 70% 55%)", "hsl(270 50% 55%)"];

export default function UsageAnalytics({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [modelData, setModelData] = useState<{ model: string; tokens: number; cost: number }[]>([]);
  const [dailyData, setDailyData] = useState<{ date: string; input: number; output: number }[]>([]);
  const [totals, setTotals] = useState({ input: 0, output: 0, cost: 0, calls: 0 });

  useEffect(() => {
    fetchAnalytics();
  }, [userId]);

  const fetchAnalytics = async () => {
    const { data: logs } = await supabase
      .from("agent_logs")
      .select("model, input_tokens, output_tokens, cost, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1000);

    if (!logs) { setLoading(false); return; }

    // Model breakdown
    const modelMap: Record<string, { tokens: number; cost: number }> = {};
    let totalInput = 0, totalOutput = 0, totalCost = 0;

    logs.forEach((log) => {
      const model = log.model || "unknown";
      if (!modelMap[model]) modelMap[model] = { tokens: 0, cost: 0 };
      const inp = log.input_tokens || 0;
      const out = log.output_tokens || 0;
      modelMap[model].tokens += inp + out;
      modelMap[model].cost += Number(log.cost || 0);
      totalInput += inp;
      totalOutput += out;
      totalCost += Number(log.cost || 0);
    });

    setModelData(Object.entries(modelMap).map(([model, d]) => ({ model, ...d })));
    setTotals({ input: totalInput, output: totalOutput, cost: totalCost, calls: logs.length });

    // Daily token usage (last 14 days)
    const dayMap: Record<string, { input: number; output: number }> = {};
    logs.forEach((log) => {
      const day = log.created_at.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { input: 0, output: 0 };
      dayMap[day].input += log.input_tokens || 0;
      dayMap[day].output += log.output_tokens || 0;
    });

    const sorted = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, d]) => ({ date: date.slice(5), ...d }));

    setDailyData(sorted);
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold font-serif text-foreground">Usage Analytics</h3>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Input Tokens", value: totals.input.toLocaleString(), icon: Cpu, color: "text-primary" },
          { label: "Total Output Tokens", value: totals.output.toLocaleString(), icon: Zap, color: "text-secondary" },
          { label: "Total Cost", value: `$${totals.cost.toFixed(2)}`, icon: Coins, color: "text-accent" },
          { label: "Total API Calls", value: totals.calls.toLocaleString(), icon: Zap, color: "text-status-info" },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Daily token chart */}
      {dailyData.length > 0 && (
        <div className="glass-card rounded-xl p-6 border border-border">
          <h4 className="text-sm font-medium text-foreground mb-4">Daily Token Usage (14d)</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 20%)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(225 10% 50%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(225 10% 50%)" }} />
              <Tooltip contentStyle={{ background: "hsl(225 14% 9%)", border: "1px solid hsl(225 10% 16%)", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="input" name="Input" fill="hsl(34 80% 56%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="output" name="Output" fill="hsl(195 50% 45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Model breakdown pie */}
      {modelData.length > 0 && (
        <div className="glass-card rounded-xl p-6 border border-border">
          <h4 className="text-sm font-medium text-foreground mb-4">Token Usage by Model</h4>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={modelData} dataKey="tokens" nameKey="model" cx="50%" cy="50%" outerRadius={80} label={({ model }) => model}>
                  {modelData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(225 14% 9%)", border: "1px solid hsl(225 10% 16%)", borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {modelData.map((m, i) => (
                <div key={m.model} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-foreground font-mono">{m.model}</span>
                  <span className="text-muted-foreground">({m.tokens.toLocaleString()} tokens)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
