import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { DollarSign, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const COLORS = [
  "hsl(34, 80%, 56%)",   // primary
  "hsl(195, 50%, 45%)",  // secondary
  "hsl(160, 45%, 48%)",  // accent
  "hsl(4, 70%, 55%)",    // destructive
  "hsl(270, 50%, 55%)",  // purple
];

interface Props {
  userId: string;
}

export default function AgentCostChart({ userId }: Props) {
  const [costData, setCostData] = useState<any[]>([]);
  const [providerBreakdown, setProviderBreakdown] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCosts();
  }, [userId]);

  const fetchCosts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cost_entries")
      .select("*")
      .order("date", { ascending: true })
      .limit(30);

    if (data && data.length > 0) {
      // Group by date
      const byDate: Record<string, number> = {};
      const byProvider: Record<string, number> = {};
      data.forEach((e: any) => {
        byDate[e.date] = (byDate[e.date] || 0) + Number(e.cost);
        byProvider[e.provider] = (byProvider[e.provider] || 0) + Number(e.cost);
      });
      setCostData(Object.entries(byDate).map(([date, cost]) => ({ date, cost: Number(cost.toFixed(4)) })));
      setProviderBreakdown(Object.entries(byProvider).map(([name, value]) => ({ name, value: Number(value.toFixed(4)) })));
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

  if (costData.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border">
        <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No cost data yet</h3>
        <p className="text-muted-foreground">Cost tracking data will appear here once your agents start making API calls.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Daily cost chart */}
      <div className="glass-card rounded-xl p-6 border border-border">
        <h3 className="text-lg font-semibold font-serif text-foreground mb-4">Daily Spend</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={costData}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(225, 10%, 50%)" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(225, 10%, 50%)" }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ background: "hsl(225, 14%, 9%)", border: "1px solid hsl(225, 10%, 16%)", borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: "hsl(40, 20%, 95%)" }}
              formatter={(v: number) => [`$${v.toFixed(4)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="hsl(34, 80%, 56%)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Provider breakdown */}
      {providerBreakdown.length > 0 && (
        <div className="glass-card rounded-xl p-6 border border-border">
          <h3 className="text-lg font-semibold font-serif text-foreground mb-4">Cost by Provider</h3>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={providerBreakdown} cx="50%" cy="50%" outerRadius={80} dataKey="value" stroke="none">
                  {providerBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {providerBreakdown.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-sm text-foreground">{p.name}</span>
                  <span className="text-sm font-mono text-muted-foreground">${p.value.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
