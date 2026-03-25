import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
}

const BURN_WINDOW_HOURS = 2;
const DEFAULT_THRESHOLD = 50;

export default function BurnRateProjection({ userId }: Props) {
  const [burnRatePerHour, setBurnRatePerHour] = useState<number>(0);
  const [hoursToThreshold, setHoursToThreshold] = useState<number | null>(null);
  const [totalCostToday, setTotalCostToday] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBurnRate();
    const interval = setInterval(fetchBurnRate, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [userId]);

  const fetchBurnRate = async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - BURN_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const { data: logs } = await supabase
      .from("agent_logs")
      .select("cost, created_at")
      .eq("user_id", userId)
      .gte("created_at", windowStart);

    const { data: todayCosts } = await supabase
      .from("cost_entries")
      .select("cost")
      .eq("user_id", userId)
      .gte("date", dayStart.slice(0, 10));

    let costLast2h = 0;
    if (logs) {
      costLast2h = logs.reduce((sum, l) => sum + Number(l.cost || 0), 0);
    }

    let todayTotal = 0;
    if (todayCosts) {
      todayTotal = todayCosts.reduce((sum, c) => sum + Number(c.cost || 0), 0);
    }

    setTotalCostToday(todayTotal);

    const rate = BURN_WINDOW_HOURS > 0 ? costLast2h / BURN_WINDOW_HOURS : 0;
    setBurnRatePerHour(rate);

    if (rate > 0.01) {
      const remaining = DEFAULT_THRESHOLD - todayTotal;
      setHoursToThreshold(remaining > 0 ? remaining / rate : 0);
    } else {
      setHoursToThreshold(null);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-5 border border-border animate-pulse">
        <div className="h-4 w-32 bg-muted/30 rounded mb-3" />
        <div className="h-8 w-24 bg-muted/20 rounded" />
      </div>
    );
  }

  const isBurning = burnRatePerHour > 0.5;
  const atRisk = hoursToThreshold !== null && hoursToThreshold > 0 && hoursToThreshold < 24;
  const isIdle = burnRatePerHour < 0.01;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card rounded-xl p-5 border ${
        atRisk ? "border-status-down/50 bg-status-down/5" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Zap className={`w-4 h-4 ${isBurning ? "text-primary" : "text-muted-foreground"}`} />
        <span className="text-sm text-muted-foreground">Live Burn Rate</span>
        {atRisk && <AlertTriangle className="w-3.5 h-3.5 text-status-down" />}
      </div>

      {isIdle ? (
        <p className="text-xl font-medium text-muted-foreground mb-1">Idle</p>
      ) : (
        <p className="text-2xl font-bold font-mono text-foreground mb-1">
          ${burnRatePerHour.toFixed(2)}
          <span className="text-sm font-normal text-muted-foreground ml-1">/hour</span>
        </p>
      )}

      <div className="flex flex-col gap-1 mt-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Today: <span className="font-mono text-foreground">${totalCostToday.toFixed(2)}</span>
        </p>
        {isIdle && totalCostToday === 0 && (
          <p className="text-xs text-muted-foreground">No API activity in the last 2 hours</p>
        )}
        {hoursToThreshold !== null && burnRatePerHour > 0.01 && (
          <p className={`text-xs flex items-center gap-1.5 ${atRisk ? "text-status-down" : "text-muted-foreground"}`}>
            <TrendingUp className="w-3 h-3" />
            At current rate → $50 in{" "}
            <span className="font-mono font-medium">
              {hoursToThreshold < 1
                ? `${Math.round(hoursToThreshold * 60)} min`
                : `${hoursToThreshold.toFixed(1)} hrs`}
            </span>
          </p>
        )}
      </div>
    </motion.div>
  );
}
