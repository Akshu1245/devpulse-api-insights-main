import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Clock, DollarSign, Zap, Bot, Search, Code2,
  Wrench, Globe, Database, MessageSquare, Sparkles, List,
} from "lucide-react";

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
  logs: LogEntry[];
  agentName?: string;
}

const ACTION_ICONS: Record<string, typeof Bot> = {
  tool: Wrench,
  llm: Bot,
  search: Search,
  planner: Bot,
  scraper: Code2,
  api: Globe,
  database: Database,
  prompt: MessageSquare,
  completion: Sparkles,
};

function getIcon(actionType: string) {
  const lower = (actionType || "").toLowerCase();
  for (const [key, Icon] of Object.entries(ACTION_ICONS)) {
    if (key !== "default" && lower.includes(key)) return Icon;
  }
  return Zap;
}

// Group logs by task (task_id or id when null)
function groupByTask(entries: LogEntry[]): { taskId: string; label: string; logs: LogEntry[] }[] {
  const byTask = new Map<string, LogEntry[]>();
  for (const log of entries) {
    const key = log.task_id || log.id;
    const list = byTask.get(key) || [];
    list.push(log);
    byTask.set(key, list);
  }
  return [...byTask.entries()]
    .map(([taskId, taskLogs]) => ({
      taskId,
      label: `${taskId.slice(0, 8)}… · ${taskLogs.length} steps · $${taskLogs.reduce((s, l) => s + Number(l.cost || 0), 0).toFixed(2)}`,
      logs: taskLogs.sort((a, b) => a.step_number - b.step_number),
    }))
    .sort((a, b) => new Date(b.logs[b.logs.length - 1]?.created_at || 0).getTime() - new Date(a.logs[a.logs.length - 1]?.created_at || 0).getTime());
}

export default function AgentReplay({ logs, agentName }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);

  const tasks = useMemo(() => groupByTask(logs), [logs]);
  const sortedLogs = tasks[selectedTaskIndex]?.logs ?? [];

  useEffect(() => {
    if (!isPlaying || sortedLogs.length === 0) return;
    if (currentStep >= sortedLogs.length - 1) {
      setIsPlaying(false);
      return;
    }
    const t = setTimeout(() => setCurrentStep((s) => s + 1), 800);
    return () => clearTimeout(t);
  }, [isPlaying, currentStep, sortedLogs.length]);

  const goToStep = useCallback((i: number) => {
    setCurrentStep(Math.max(0, Math.min(i, sortedLogs.length - 1)));
    setIsPlaying(false);
  }, [sortedLogs.length]);

  if (logs.length === 0 || sortedLogs.length === 0) {
    return (
      <div className="glass-card rounded-xl p-12 border border-border text-center">
        <Play className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No steps to replay</h3>
        <p className="text-muted-foreground text-sm">
          Execution logs will appear here once your agent runs tasks.
        </p>
      </div>
    );
  }

  const displayedLogs = sortedLogs.slice(0, currentStep + 1);
  const totalCost = displayedLogs.reduce((s, l) => s + Number(l.cost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold font-serif text-foreground">Agent Replay</h3>
          <p className="text-sm text-muted-foreground">
            Step-by-step playback of agent execution
            {agentName && <span className="ml-1">· {agentName}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToStep(0)}
            disabled={currentStep === 0}
            className="p-2 rounded-lg glass-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Start over"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => goToStep(currentStep - 1)}
            disabled={currentStep === 0}
            className="p-2 rounded-lg glass-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous step"
          >
            <SkipBack className="w-4 h-4 rotate-180" />
          </button>
          <button
            onClick={() => goToStep(currentStep + 1)}
            disabled={currentStep >= sortedLogs.length - 1}
            className="p-2 rounded-lg glass-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next step"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={() => goToStep(sortedLogs.length - 1)}
            disabled={currentStep >= sortedLogs.length - 1}
            className="p-2 rounded-lg glass-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title="Go to end"
          >
            <SkipForward className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>

      {/* Task selector - when multiple tasks */}
      {tasks.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <List className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Task:</span>
          {tasks.map((t, i) => (
            <button
              key={t.taskId}
              onClick={() => setSelectedTaskIndex(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedTaskIndex === i
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "glass-card text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Timeline scrubber */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-muted-foreground mr-2">Step</span>
        {sortedLogs.map((_, i) => (
          <button
            key={i}
            onClick={() => goToStep(i)}
            className={`w-2 h-2 rounded-full transition-all ${
              i <= currentStep
                ? "bg-primary"
                : "bg-muted hover:bg-muted-foreground/30"
            } ${i === currentStep ? "ring-2 ring-primary/50 scale-125" : ""}`}
            title={`Step ${i + 1}`}
          />
        ))}
      </div>

      {/* Step counter and cost */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Step {currentStep + 1} / {sortedLogs.length}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-foreground">
          <DollarSign className="w-3.5 h-3.5" />
          ${totalCost.toFixed(4)}
        </span>
      </div>

      {/* Step-by-step timeline */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        <AnimatePresence mode="popLayout">
          {displayedLogs.map((step, i) => {
            const Icon = getIcon(step.action_type);
            const isLatest = i === currentStep;
            return (
              <motion.div
                key={step.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`rounded-xl p-4 border flex items-center gap-4 transition-all ${
                  isLatest
                    ? "glass-card border-primary/40 bg-primary/5"
                    : "glass-card border-border opacity-75"
                } ${step.is_loop_detected ? "border-status-down/50 bg-status-down/5" : ""}`}
              >
                <div className="w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {step.action_type}
                    {step.provider && (
                      <span className="text-muted-foreground font-normal ml-1">
                        · {step.provider}
                        {step.model ? ` / ${step.model}` : ""}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">Step {step.step_number}</span>
                    {step.latency_ms != null && <span>{step.latency_ms}ms</span>}
                    {step.cost != null && step.cost > 0 && (
                      <span className="font-mono text-primary">${Number(step.cost).toFixed(4)}</span>
                    )}
                    {step.is_loop_detected && (
                      <span className="text-status-down font-medium">⚠ Loop detected</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {new Date(step.created_at).toLocaleTimeString()}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
