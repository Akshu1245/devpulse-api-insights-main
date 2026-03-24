import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
}

export default function CostAnomalyAlert({ userId }: Props) {
  const [anomaly, setAnomaly] = useState<{
    todayCost: number;
    avg7d: number;
    ratio: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const start = sevenDaysAgo.toISOString().slice(0, 10);

      const { data } = await supabase
        .from("cost_entries")
        .select("date, cost")
        .eq("user_id", userId)
        .gte("date", start)
        .lte("date", today);

      setLoading(false);
      if (!data || data.length === 0) return;

      const byDate: Record<string, number> = {};
      data.forEach((row: { date: string; cost: number }) => {
        byDate[row.date] = (byDate[row.date] || 0) + Number(row.cost);
      });

      const todayCost = byDate[today] || 0;
      const dates = Object.keys(byDate).filter(d => d !== today).sort().slice(-7);
      const avg7d = dates.length > 0
        ? dates.reduce((s, d) => s + byDate[d], 0) / dates.length
        : 0;

      if (avg7d > 0 && todayCost > avg7d * 2) {
        setAnomaly({
          todayCost,
          avg7d,
          ratio: Math.round((todayCost / avg7d) * 100) / 100,
        });
      }
    }
    check();
  }, [userId]);

  if (loading || !anomaly) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-4 border border-status-down/30 bg-status-down/5 flex items-start gap-3"
    >
      <AlertTriangle className="w-5 h-5 text-status-down shrink-0 mt-0.5" />
      <div>
        <h4 className="font-semibold text-foreground text-sm">Cost anomaly detected</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Today&apos;s spend (${anomaly.todayCost.toFixed(2)}) is <span className="text-status-down font-mono font-semibold">{anomaly.ratio}x</span> your 7‑day average (${anomaly.avg7d.toFixed(2)}). Review agent usage and cost limits.
        </p>
      </div>
    </motion.div>
  );
}
