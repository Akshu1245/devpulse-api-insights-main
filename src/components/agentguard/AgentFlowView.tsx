import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  MessageSquare, Search, Code2, Cpu, ArrowDown, Bot, Zap, Loader2,
  Database, Globe, Sparkles, Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Agent = {
  id: string;
  name: string;
  framework: string | null;
  status: string;
};

type LogEntry = {
  id: string;
  action_type: string;
  provider: string | null;
  model: string | null;
  cost: number | null;
  latency_ms: number | null;
  step_number: number;
  task_id: string | null;
  is_loop_detected: boolean | null;
  created_at: string;
};

interface Props {
  agents: Agent[];
  userId: string;
}

const ACTION_ICONS: Record<string, { icon: typeof Cpu; color: string }> = {
  tool: { icon: Wrench, color: "text-accent" },
  llm: { icon: Bot, color: "text-status-healthy" },
  search: { icon: Search, color: "text-secondary" },
  planner: { icon: Cpu, color: "text-primary" },
  scraper: { icon: Code2, color: "text-status-degraded" },
  api: { icon: Globe, color: "text-secondary" },
  database: { icon: Database, color: "text-accent" },
  prompt: { icon: MessageSquare, color: "text-primary" },
  completion: { icon: Sparkles, color: "text-status-healthy" },
  default: { icon: Zap, color: "text-muted-foreground" },
};

function getActionConfig(actionType: string) {
  const lower = (actionType || "").toLowerCase();
  for (const [key, config] of Object.entries(ACTION_ICONS)) {
    if (key !== "default" && lower.includes(key)) return config;
  }
  return ACTION_ICONS.default;
}

export default function AgentFlowView({ agents, userId }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || agents.length === 0) {
      setLoading(false);
      return;
    }
    async function fetchLogs() {
      const agentIds = agents.map(a => a.id);
      const { data } = await supabase
        .from("agent_logs")
        .select("id, action_type, provider, model, cost, latency_ms, step_number, task_id, is_loop_detected, created_at")
        .in("agent_id", agentIds)
        .order("created_at", { ascending: false })
        .limit(100);
      setLogs((data as LogEntry[]) || []);
      setLoading(false);
    }
    fetchLogs();
  }, [userId, agents]);

  const tasks = useMemo(() => {
    const byTask = new Map<string, LogEntry[]>();
    for (const log of logs) {
      const key = log.task_id || log.id;
      const list = byTask.get(key) || [];
      list.push(log);
      byTask.set(key, list);
    }
    return [...byTask.entries()]
      .map(([taskId, entries]) => ({
        taskId,
        entries: entries.sort((a, b) => a.step_number - b.step_number),
        lastAt: entries.reduce((max, e) => Math.max(max, new Date(e.created_at).getTime()), 0),
      }))
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, 5);
  }, [logs]);

  const displayTask = selectedTaskId
    ? tasks.find(t => t.taskId === selectedTaskId) || tasks[0]
    : tasks[0];

  if (agents.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border border-border">
        <Cpu className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Agent Flow Visualization</h3>
        <p className="text-muted-foreground">Add agents and run tasks to see the execution flow.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center border border-border">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Loading execution traces…</p>
      </div>
    );
  }

  const hasRealFlows = displayTask && displayTask.entries.length > 0;

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-xl p-6 border border-border">
        <h3 className="text-lg font-semibold font-serif text-foreground mb-2">Agent Execution Flow</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {hasRealFlows
            ? "Live execution traces from your agents. Each step shows the action, provider, and performance."
            : "Connect your agent SDK to see real execution flows. Traces appear as your agents run tasks."}
        </p>

        {hasRealFlows && tasks.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {tasks.map((t) => (
              <button
                key={t.taskId}
                onClick={() => setSelectedTaskId(t.taskId === selectedTaskId ? null : t.taskId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  (!selectedTaskId && t === tasks[0]) || selectedTaskId === t.taskId
                    ? "bg-primary/15 text-primary border border-primary/25"
                    : "glass-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.taskId.slice(0, 8)}… ({t.entries.length} steps)
              </button>
            ))}
          </div>
        )}

        {hasRealFlows && displayTask ? (
          <div className="flex flex-col items-center gap-2 max-w-lg mx-auto">
            {displayTask.entries.map((step, i) => {
              const cfg = getActionConfig(step.action_type);
              const Icon = cfg.icon;
              return (
                <div key={step.id}>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={`glass-card rounded-xl p-4 border flex items-center gap-3 w-full ${
                      step.is_loop_detected ? "border-status-down/50 bg-status-down/5" : "border-border"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {step.action_type}
                        {step.provider && (
                          <span className="text-muted-foreground font-normal ml-1">
                            · {step.provider}{step.model ? ` / ${step.model}` : ""}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-3">
                        Step {step.step_number}
                        {step.latency_ms != null && (
                          <span className="font-mono">{step.latency_ms}ms</span>
                        )}
                        {step.cost != null && step.cost > 0 && (
                          <span className="font-mono text-primary">${Number(step.cost).toFixed(4)}</span>
                        )}
                        {step.is_loop_detected && (
                          <span className="text-status-down">⚠ Loop detected</span>
                        )}
                      </p>
                    </div>
                  </motion.div>
                  {i < displayTask.entries.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground font-mono mt-2">
              {new Date(displayTask.entries[displayTask.entries.length - 1]?.created_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 max-w-sm mx-auto py-8">
            <Zap className="w-12 h-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground text-center">
              No execution traces yet. Run a task with the AgentGuard SDK to see live flows.
            </p>
          </div>
        )}
      </div>

      <div className="glass-card rounded-xl p-6 border border-border">
        <h4 className="font-semibold text-foreground mb-2">🔧 SDK Integration</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Integrate the AgentGuard SDK to capture real execution traces:
        </p>
        <pre className="text-xs font-mono p-4 rounded-lg bg-muted/30 border border-border text-muted-foreground overflow-x-auto">
{`import { AgentGuard } from '@agentguard/sdk';

const guard = new AgentGuard({
  apiKey: 'ag_xxxx',
  agentId: '${agents[0]?.id || "your-agent-id"}'
});

const result = await guard.track(async () => {
  return await openai.chat.completions.create({...});
});`}
        </pre>
      </div>
    </div>
  );
}
