import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Zap, DollarSign, Clock, Star } from "lucide-react";

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

function scoreAgent(agent: Agent) {
  const costPerTask = agent.total_tasks > 0 ? Number(agent.total_cost) / agent.total_tasks : 0;
  const callsPerTask = agent.total_tasks > 0 ? agent.total_api_calls / agent.total_tasks : 0;

  // Score 0-100
  const costScore = Math.max(0, 100 - costPerTask * 50);
  const efficiencyScore = Math.max(0, 100 - callsPerTask * 2);
  const activityScore = Math.min(100, agent.total_tasks * 5);

  const overall = Math.round((costScore * 0.4 + efficiencyScore * 0.35 + activityScore * 0.25));

  return {
    overall,
    costPerTask,
    callsPerTask,
    costScore: Math.round(costScore),
    efficiencyScore: Math.round(efficiencyScore),
    activityScore: Math.round(activityScore),
  };
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "hsl(var(--status-healthy))" : score >= 50 ? "hsl(var(--status-degraded))" : "hsl(var(--status-down))";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={4} fill="none" stroke="hsl(var(--muted))" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={radius} strokeWidth={4} fill="none"
        stroke={color} strokeLinecap="round"
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: "easeOut" }}
        strokeDasharray={circumference}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dy="0.35em"
        className="fill-foreground text-sm font-mono font-bold" transform={`rotate(90 ${size / 2} ${size / 2})`}>
        {score}
      </text>
    </svg>
  );
}

export default function PerformanceScoring({ agents }: Props) {
  const scored = useMemo(
    () => agents.map(a => ({ ...a, score: scoreAgent(a) })).sort((a, b) => b.score.overall - a.score.overall),
    [agents]
  );

  if (agents.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border">
        <Star className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No performance data</h3>
        <p className="text-muted-foreground">Add agents and run tasks to see performance scores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold font-serif text-foreground">Agent Performance Scores</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scored.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-5 border border-border"
          >
            <div className="flex items-center gap-4 mb-4">
              <ScoreRing score={agent.score.overall} />
              <div>
                <h4 className="font-semibold text-foreground">{agent.name}</h4>
                <p className="text-xs text-muted-foreground">Overall Score</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Cost", value: agent.score.costScore, icon: DollarSign },
                { label: "Efficiency", value: agent.score.efficiencyScore, icon: Zap },
                { label: "Activity", value: agent.score.activityScore, icon: TrendingUp },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <m.icon className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
                  <p className="font-mono text-sm text-foreground">{m.value}</p>
                  <p className="text-[10px] text-muted-foreground">{m.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>$/task: <span className="text-foreground font-mono">${agent.score.costPerTask.toFixed(3)}</span></span>
              <span>Calls/task: <span className="text-foreground font-mono">{agent.score.callsPerTask.toFixed(1)}</span></span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
