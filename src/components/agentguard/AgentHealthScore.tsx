import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Heart, DollarSign, Zap, AlertTriangle, Clock, Shield, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Agent = {
  id: string;
  name: string;
  total_cost: number;
  total_api_calls: number;
  total_tasks: number;
  status: string;
};

interface Props {
  agents: Agent[];
}

type AgentStats = Agent & {
  loopCount: number;
  avgLatencyMs: number;
  hasLeakAlert: boolean;
};

function scoreAgent(a: AgentStats): { overall: number; cost: number; efficiency: number; loops: number; latency: number } {
  const costPerTask = a.total_tasks > 0 ? Number(a.total_cost) / a.total_tasks : 0;
  const callsPerTask = a.total_tasks > 0 ? a.total_api_calls / a.total_tasks : 0;

  // Cost score: lower $/task = better (0-100)
  const costScore = Math.max(0, Math.min(100, 100 - costPerTask * 25));

  // Efficiency: fewer calls/task = better
  const efficiencyScore = Math.max(0, Math.min(100, 100 - callsPerTask * 1.5));

  // Loop penalty: any loop = big hit
  const loopScore = a.loopCount === 0 ? 100 : Math.max(0, 100 - a.loopCount * 25);

  // Latency: <500ms = 100, <2s = 80, <5s = 60, else lower
  const latencyScore =
    a.avgLatencyMs <= 0 ? 100 : a.avgLatencyMs < 500 ? 100 : a.avgLatencyMs < 2000 ? 80 : a.avgLatencyMs < 5000 ? 60 : Math.max(0, 60 - (a.avgLatencyMs - 5000) / 100);

  // Leak penalty
  const leakPenalty = a.hasLeakAlert ? 20 : 0;

  const overall = Math.round(
    Math.max(0, Math.min(100, (costScore * 0.3 + efficiencyScore * 0.25 + loopScore * 0.25 + latencyScore * 0.2) - leakPenalty))
  );

  return {
    overall,
    cost: Math.round(costScore),
    efficiency: Math.round(efficiencyScore),
    loops: Math.round(loopScore),
    latency: Math.round(Math.min(100, latencyScore)),
  };
}

function ScoreRing({ score, size = 56, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 75 ? "hsl(var(--status-healthy))" : score >= 50 ? "hsl(var(--status-degraded))" : "hsl(var(--status-down))";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={4} fill="none" stroke="hsl(var(--muted))" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={4}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          strokeDasharray={circumference}
        />
      </svg>
      <span className="text-lg font-bold font-mono mt-1 text-foreground">{score}</span>
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
    </div>
  );
}

export default function AgentHealthScore({ agents }: Props) {
  const [stats, setStats] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (agents.length === 0) {
      setLoading(false);
      return;
    }
    async function fetchStats() {
      const agentIds = agents.map((a) => a.id);

      const [logsRes, alertsRes] = await Promise.all([
        supabase
          .from("agent_logs")
          .select("agent_id, is_loop_detected, latency_ms")
          .in("agent_id", agentIds),
        supabase.from("alerts").select("agent_id, alert_type").eq("alert_type", "key_leak").in("agent_id", agentIds),
      ]);

      const loopCountByAgent: Record<string, number> = {};
      const latencySumByAgent: Record<string, { sum: number; count: number }> = {};
      const leakAgents = new Set<string>();

      (logsRes.data || []).forEach((log: any) => {
        loopCountByAgent[log.agent_id] = (loopCountByAgent[log.agent_id] || 0) + (log.is_loop_detected ? 1 : 0);
        if (log.latency_ms) {
          const cur = latencySumByAgent[log.agent_id] || { sum: 0, count: 0 };
          latencySumByAgent[log.agent_id] = { sum: cur.sum + log.latency_ms, count: cur.count + 1 };
        }
      });

      (alertsRes.data || []).forEach((a: any) => a.agent_id && leakAgents.add(a.agent_id));

      setStats(
        agents.map((a) => ({
          ...a,
          loopCount: loopCountByAgent[a.id] || 0,
          avgLatencyMs: latencySumByAgent[a.id] ? latencySumByAgent[a.id].sum / latencySumByAgent[a.id].count : 0,
          hasLeakAlert: leakAgents.has(a.id),
        }))
      );
      setLoading(false);
    }
    fetchStats();
  }, [agents]);

  const scored = useMemo(
    () =>
      stats.map((a) => ({ ...a, score: scoreAgent(a) })).sort((a, b) => b.score.overall - a.score.overall),
    [stats]
  );

  if (loading || agents.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border">
        <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Agent Health Score</h3>
        <p className="text-muted-foreground text-sm">
          {loading ? "Calculating health scores…" : "Add agents to see 0-100 health scores."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Heart className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold font-serif text-foreground">Agent Health Score</h3>
        <span className="text-xs text-muted-foreground">0-100 · Cost, efficiency, loops, latency</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scored.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-5 border border-border"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-semibold text-foreground">{agent.name}</h4>
                <p className="text-xs text-muted-foreground">Overall Health</p>
              </div>
              <ScoreRing score={agent.score.overall} label="Health" />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Cost", value: agent.score.cost, icon: DollarSign },
                { label: "Eff.", value: agent.score.efficiency, icon: Zap },
                { label: "Loops", value: agent.score.loops, icon: AlertTriangle },
                { label: "Latency", value: agent.score.latency, icon: Clock },
              ].map((m) => (
                <div key={m.label} className="text-center p-2 rounded-lg bg-muted/20">
                  <m.icon className="w-3 h-3 mx-auto text-muted-foreground mb-0.5" />
                  <p className="font-mono text-xs font-medium text-foreground">{m.value}</p>
                  <p className="text-[9px] text-muted-foreground">{m.label}</p>
                </div>
              ))}
            </div>

            {(agent.loopCount > 0 || agent.hasLeakAlert) && (
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-status-down">
                <Shield className="w-3.5 h-3.5" />
                {agent.loopCount > 0 && <span>{agent.loopCount} loop(s) detected</span>}
                {agent.hasLeakAlert && <span>Key leak alert</span>}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
