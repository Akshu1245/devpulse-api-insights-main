import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Zap,
  DollarSign,
  Repeat,
  Activity,
  Settings,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  KillSwitchEngine,
  getKillSwitchEngine,
  DEFAULT_THRESHOLDS,
  DEFAULT_CONFIG,
} from "@/lib/killSwitch";
import type {
  KillSwitchStatus,
  KillSwitchEvent,
  KillSwitchThresholds,
  ViolationType,
} from "@/lib/killSwitch";

interface Props {
  agents: Array<{ id: string; name: string; status: string }>;
  userId: string;
  onAgentStatusChange: () => void;
}

type KillSwitchTab = "status" | "config" | "events";

const VIOLATION_ICONS: Record<ViolationType, typeof Zap> = {
  rapid_api_calls: Zap,
  cost_spike: DollarSign,
  infinite_loop: Repeat,
  circuit_breaker: Activity,
};

const VIOLATION_COLORS: Record<ViolationType, string> = {
  rapid_api_calls: "text-yellow-400",
  cost_spike: "text-red-400",
  infinite_loop: "text-orange-400",
  circuit_breaker: "text-purple-400",
};

const STATE_CONFIG = {
  armed: { icon: ShieldCheck, color: "text-status-healthy", bg: "bg-status-healthy/10", label: "Armed" },
  triggered: { icon: ShieldAlert, color: "text-status-down", bg: "bg-status-down/10", label: "Triggered" },
  cooldown: { icon: ShieldOff, color: "text-status-degraded", bg: "bg-status-degraded/10", label: "Cooldown" },
  disabled: { icon: ShieldOff, color: "text-muted-foreground", bg: "bg-muted/10", label: "Disabled" },
};

export default function AutonomousKillSwitch({ agents, userId, onAgentStatusChange }: Props) {
  const [engine] = useState(() => getKillSwitchEngine());
  const [status, setStatus] = useState<KillSwitchStatus>(engine.getStatus());
  const [events, setEvents] = useState<KillSwitchEvent[]>(engine.getEventLog());
  const [activeTab, setActiveTab] = useState<KillSwitchTab>("status");
  const [showConfig, setShowConfig] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [thresholds, setThresholds] = useState<KillSwitchThresholds>({ ...DEFAULT_THRESHOLDS });
  const [serverMetrics, setServerMetrics] = useState<Record<string, any>>({});
  const [checkingAgent, setCheckingAgent] = useState<string | null>(null);
  const { toast } = useToast();
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const unsubState = engine.onStateChange((newStatus) => {
      setStatus({ ...newStatus });
    });

    const unsubViolation = engine.onViolation((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
    });

    return () => {
      unsubState();
      unsubViolation();
    };
  }, [engine]);

  const checkAgent = useCallback(
    async (agentId: string) => {
      setCheckingAgent(agentId);
      try {
        const { data, error } = await supabase.functions.invoke("kill-switch", {
          body: { agent_id: agentId, action: "check" },
        });

        if (error) throw error;

        if (data?.triggered) {
          toast({
            title: "Kill switch triggered",
            description: `${data.violations.length} violation(s) detected`,
            variant: "destructive",
          });
          onAgentStatusChange();
        }

        setServerMetrics((prev) => ({
          ...prev,
          [agentId]: {
            ...data,
            lastChecked: new Date().toLocaleTimeString(),
          },
        }));
      } catch (err: any) {
        toast({ title: "Check failed", description: err.message, variant: "destructive" });
      } finally {
        setCheckingAgent(null);
      }
    },
    [toast, onAgentStatusChange]
  );

  const checkAllAgents = useCallback(async () => {
    for (const agent of agents.filter((a) => a.status === "active")) {
      await checkAgent(agent.id);
    }
    toast({ title: "Kill switch scan complete" });
  }, [agents, checkAgent, toast]);

  const manualTrigger = useCallback(
    async (agentId: string, agentName: string) => {
      try {
        const { data } = await supabase.functions.invoke("kill-switch", {
          body: {
            agent_id: agentId,
            action: "manual_trigger",
            reason: `Manual kill switch for ${agentName}`,
          },
        });

        if (data?.triggered) {
          toast({
            title: "Agent stopped",
            description: `${agentName} has been killed`,
            variant: "destructive",
          });
          onAgentStatusChange();
        }
      } catch (err: any) {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      }
    },
    [toast, onAgentStatusChange]
  );

  const resumeAgent = useCallback(
    async (agentId: string, agentName: string) => {
      try {
        await supabase.functions.invoke("kill-switch", {
          body: { agent_id: agentId, action: "resume" },
        });
        engine.unpauseAgent(agentId);
        engine.unblockApiKey(agentId);
        toast({ title: "Agent resumed", description: `${agentName} is active again` });
        onAgentStatusChange();
      } catch (err: any) {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      }
    },
    [engine, toast, onAgentStatusChange]
  );

  const saveConfig = useCallback(async () => {
    setConfiguring(true);
    engine.configure({ thresholds, enabled: true });
    toast({ title: "Configuration saved" });
    setConfiguring(false);
    setShowConfig(false);
  }, [engine, thresholds, toast]);

  const toggleEnabled = useCallback(() => {
    const newEnabled = status.state === "disabled";
    engine.configure({ enabled: newEnabled });
    toast({
      title: newEnabled ? "Kill switch armed" : "Kill switch disabled",
      variant: newEnabled ? "default" : "destructive",
    });
  }, [engine, status.state, toast]);

  const stateInfo = STATE_CONFIG[status.state];
  const StateIcon = stateInfo.icon;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${stateInfo.bg}`}>
            <StateIcon className={`w-5 h-5 ${stateInfo.color}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold font-serif text-foreground">
              Autonomous Kill Switch
            </h3>
            <p className="text-xs text-muted-foreground">
              State: <span className={`font-mono ${stateInfo.color}`}>{stateInfo.label}</span>
              {status.totalTriggers > 0 && (
                <span className="ml-2">| Triggers: {status.totalTriggers}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleEnabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status.state === "disabled"
                ? "bg-status-healthy/10 text-status-healthy hover:bg-status-healthy/20"
                : "bg-status-down/10 text-status-down hover:bg-status-down/20"
            }`}
          >
            {status.state === "disabled" ? (
              <>
                <ShieldCheck className="w-3 h-3" /> Arm
              </>
            ) : (
              <>
                <ShieldOff className="w-3 h-3" /> Disarm
              </>
            )}
          </button>
          <button
            onClick={checkAllAgents}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs text-muted-foreground hover:text-foreground border border-border transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Scan All
          </button>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs text-muted-foreground hover:text-foreground border border-border transition-colors"
          >
            <Settings className="w-3 h-3" />
            {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Config Panel */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card rounded-xl p-4 border border-border space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Threshold Configuration</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  { key: "maxRequestsPerSec", label: "Max Req/Sec", icon: Zap, step: 1 },
                  { key: "maxRequestsPerMin", label: "Max Req/Min", icon: Activity, step: 5 },
                  { key: "maxCostPerMin", label: "Max Cost/Min ($)", icon: DollarSign, step: 0.5 },
                  { key: "maxCostPerHour", label: "Max Cost/Hour ($)", icon: DollarSign, step: 5 },
                  { key: "maxLoopRepetitions", label: "Max Loop Reps", icon: Repeat, step: 1 },
                  { key: "loopWindowSec", label: "Loop Window (s)", icon: Activity, step: 5 },
                  { key: "maxConsecutiveFailures", label: "Max Failures", icon: XCircle, step: 1 },
                  { key: "cooldownSec", label: "Cooldown (s)", icon: Pause, step: 5 },
                ] as const).map(({ key, label, icon: Icon, step }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Icon className="w-3 h-3" /> {label}
                    </label>
                    <input
                      type="number"
                      value={thresholds[key]}
                      step={step}
                      min={0}
                      onChange={(e) =>
                        setThresholds((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-2 py-1 rounded-lg bg-muted/30 border border-border text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={saveConfig}
                disabled={configuring}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {configuring ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["status", "config", "events"] as KillSwitchTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab
                ? "bg-primary/15 text-primary border border-primary/25"
                : "glass-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "status" ? "Agent Status" : tab === "config" ? "Action Config" : `Events (${events.length})`}
          </button>
        ))}
      </div>

      {/* Agent Status Tab */}
      {activeTab === "status" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => {
            const isBlocked = status.blockedApiKeys.has(agent.id);
            const isPaused = status.pausedAgents.has(agent.id);
            const metrics = serverMetrics[agent.id];
            const isChecking = checkingAgent === agent.id;

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-4 border border-border space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isBlocked ? (
                      <XCircle className="w-4 h-4 text-status-down" />
                    ) : isPaused ? (
                      <Pause className="w-4 h-4 text-status-degraded" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-status-healthy" />
                    )}
                    <span className="text-sm font-semibold text-foreground">{agent.name}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      isBlocked
                        ? "bg-status-down/10 text-status-down"
                        : isPaused
                        ? "bg-status-degraded/10 text-status-degraded"
                        : "bg-status-healthy/10 text-status-healthy"
                    }`}
                  >
                    {isBlocked ? "BLOCKED" : isPaused ? "PAUSED" : agent.status}
                  </span>
                </div>

                {metrics && (
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="text-muted-foreground">Req/min</span>
                      <p className="font-mono text-foreground">
                        {metrics.metrics?.requests_per_min ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cost/min</span>
                      <p className="font-mono text-foreground">
                        ${metrics.metrics?.cost_per_min?.toFixed(4) ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cost/hr</span>
                      <p className="font-mono text-foreground">
                        ${metrics.metrics?.cost_per_hour?.toFixed(2) ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Loops</span>
                      <p className={`font-mono ${metrics.metrics?.loop_detected ? "text-status-down" : "text-foreground"}`}>
                        {metrics.metrics?.loop_detected ? "DETECTED" : "None"}
                      </p>
                    </div>
                  </div>
                )}

                {metrics?.lastChecked && (
                  <p className="text-[10px] text-muted-foreground">
                    Last checked: {metrics.lastChecked}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => checkAgent(agent.id)}
                    disabled={isChecking}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg glass-card text-[10px] text-muted-foreground hover:text-foreground border border-border transition-colors disabled:opacity-50"
                  >
                    {isChecking ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Activity className="w-3 h-3" />
                    )}
                    Check
                  </button>
                  {agent.status === "active" && !isBlocked && !isPaused && (
                    <button
                      onClick={() => manualTrigger(agent.id, agent.name)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-status-down/10 text-status-down text-[10px] font-medium hover:bg-status-down/20 transition-colors"
                    >
                      <ShieldAlert className="w-3 h-3" />
                      Kill
                    </button>
                  )}
                  {(isBlocked || isPaused || agent.status === "paused" || agent.status === "stopped") && (
                    <button
                      onClick={() => resumeAgent(agent.id, agent.name)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-status-healthy/10 text-status-healthy text-[10px] font-medium hover:bg-status-healthy/20 transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      Resume
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
          {agents.length === 0 && (
            <div className="col-span-full glass-card rounded-xl p-8 text-center border border-border">
              <ShieldOff className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No agents to monitor</p>
            </div>
          )}
        </div>
      )}

      {/* Action Config Tab */}
      {activeTab === "config" && (
        <div className="space-y-3">
          {(
            [
              ["rapid_api_calls", "Rapid API Calls", "Pause requests + send alert"],
              ["cost_spike", "Cost Spike", "Block API key + send alert"],
              ["infinite_loop", "Infinite Loop", "Pause requests + send alert"],
              ["circuit_breaker", "Circuit Breaker", "Block API key + send alert"],
            ] as const
          ).map(([type, title, desc]) => {
            const Icon = VIOLATION_ICONS[type];
            const color = VIOLATION_COLORS[type];
            const actions = DEFAULT_CONFIG.actions[type];
            return (
              <div
                key={type}
                className="glass-card rounded-xl p-4 border border-border flex items-center gap-4"
              >
                <div className={`p-2 rounded-lg bg-muted/20`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <div className="flex gap-1.5">
                  {actions.map((a) => (
                    <span
                      key={a}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted/30 text-muted-foreground"
                    >
                      {a.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Events Tab */}
      {activeTab === "events" && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center border border-border">
              <CheckCircle2 className="w-8 h-8 text-status-healthy mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No kill switch events recorded</p>
            </div>
          ) : (
            events.map((event) => {
              const Icon = VIOLATION_ICONS[event.violation.type];
              const color = VIOLATION_COLORS[event.violation.type];
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`glass-card rounded-xl p-3 border ${
                    event.violation.severity === "critical"
                      ? "border-status-down/30"
                      : "border-status-degraded/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`w-4 h-4 mt-0.5 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            event.violation.severity === "critical"
                              ? "bg-status-down/10 text-status-down"
                              : "bg-status-degraded/10 text-status-degraded"
                          }`}
                        >
                          {event.violation.severity}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-foreground">{event.violation.message}</p>
                      <div className="flex gap-1 mt-1.5">
                        {event.actionsTaken.map((a) => (
                          <span
                            key={a}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground"
                          >
                            {a.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                    {event.resolved ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-status-healthy shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-status-down shrink-0" />
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Live Metrics Bar */}
      {status.lastViolation && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-3 border border-status-down/30"
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-status-down" />
            <span className="text-xs font-semibold text-status-down">Last Violation</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {status.lastViolation.type.replace(/_/g, " ")}: {status.lastViolation.message}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-muted/20 overflow-hidden">
            <motion.div
              className="h-full bg-status-down rounded-full"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 30, ease: "linear" }}
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
