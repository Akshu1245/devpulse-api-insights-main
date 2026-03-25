import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Layers, Loader2 } from "lucide-react";

const COLORS = [
  "hsl(34, 80%, 56%)",
  "hsl(195, 50%, 45%)",
  "hsl(160, 45%, 48%)",
  "hsl(4, 70%, 55%)",
  "hsl(270, 50%, 55%)",
  "hsl(45, 80%, 50%)",
];

interface Props {
  userId: string;
}

type ProviderData = {
  provider: string;
  total_cost: number;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_cost_per_call: number;
};

export default function ProviderComparison({ userId }: Props) {
  const [data, setData] = useState<ProviderData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data: entries } = await supabase
        .from("cost_entries")
        .select("provider, cost, api_calls, input_tokens, output_tokens")
        .eq("user_id", userId);

      if (!entries) { setLoading(false); return; }

      const grouped = new Map<string, ProviderData>();
      for (const e of entries) {
        const existing = grouped.get(e.provider) || {
          provider: e.provider, total_cost: 0, total_calls: 0,
          total_input_tokens: 0, total_output_tokens: 0, avg_cost_per_call: 0,
        };
        existing.total_cost += Number(e.cost);
        existing.total_calls += e.api_calls;
        existing.total_input_tokens += e.input_tokens || 0;
        existing.total_output_tokens += e.output_tokens || 0;
        grouped.set(e.provider, existing);
      }

      const result = [...grouped.values()].map(d => ({
        ...d,
        avg_cost_per_call: d.total_calls > 0 ? d.total_cost / d.total_calls : 0,
      })).sort((a, b) => b.total_cost - a.total_cost);

      setData(result);
      setLoading(false);
    }
    fetch();
  }, [userId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  if (data.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border">
        <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No provider data</h3>
        <p className="text-muted-foreground">Cost entries will appear here once agents start making API calls.</p>
      </div>
    );
  }

  const pieData = data.map(d => ({ name: d.provider, value: d.total_cost }));

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold font-serif text-foreground">Provider Comparison</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost by provider bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-xl p-5 border border-border">
          <h4 className="text-sm font-medium text-muted-foreground mb-4">Cost by Provider</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <XAxis dataKey="provider" tick={{ fill: "hsl(225,10%,50%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(225,10%,50%)", fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: "hsl(225,14%,9%)", border: "1px solid hsl(225,10%,16%)", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="total_cost" name="Total Cost" fill="hsl(34,80%,56%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Cost distribution pie */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-xl p-5 border border-border">
          <h4 className="text-sm font-medium text-muted-foreground mb-4">Cost Distribution</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(225,14%,9%)", border: "1px solid hsl(225,10%,16%)", borderRadius: 12, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Provider stats table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-4 text-muted-foreground font-medium">Provider</th>
              <th className="text-right p-4 text-muted-foreground font-medium">Total Cost</th>
              <th className="text-right p-4 text-muted-foreground font-medium">API Calls</th>
              <th className="text-right p-4 text-muted-foreground font-medium">Avg $/Call</th>
              <th className="text-right p-4 text-muted-foreground font-medium hidden md:table-cell">Input Tokens</th>
              <th className="text-right p-4 text-muted-foreground font-medium hidden md:table-cell">Output Tokens</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.provider} className="border-b border-border/50 last:border-0">
                <td className="p-4 font-medium text-foreground flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  {d.provider}
                </td>
                <td className="p-4 text-right font-mono text-foreground">${d.total_cost.toFixed(2)}</td>
                <td className="p-4 text-right font-mono text-foreground">{d.total_calls.toLocaleString()}</td>
                <td className="p-4 text-right font-mono text-foreground">${d.avg_cost_per_call.toFixed(4)}</td>
                <td className="p-4 text-right font-mono text-muted-foreground hidden md:table-cell">{d.total_input_tokens.toLocaleString()}</td>
                <td className="p-4 text-right font-mono text-muted-foreground hidden md:table-cell">{d.total_output_tokens.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
