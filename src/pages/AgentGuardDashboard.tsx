import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Activity, DollarSign, AlertTriangle, Bot, Plus, LogOut,
  TrendingUp, Zap, Bell, ChevronRight, ArrowLeft,
  Loader2, Cpu, BarChart3, Radio, Star, Layers, Download, ScrollText, BookOpen, PieChart
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useTasksThisMonth } from "@/hooks/useTasksThisMonth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import AgentCostChart from "@/components/agentguard/AgentCostChart";
import AgentFlowView from "@/components/agentguard/AgentFlowView";
import AlertsFeed from "@/components/agentguard/AlertsFeed";
import AddAgentModal from "@/components/agentguard/AddAgentModal";
import AgentHealthScore from "@/components/agentguard/AgentHealthScore";
import BurnRateProjection from "@/components/agentguard/BurnRateProjection";
import ProviderComparison from "@/components/agentguard/ProviderComparison";
import ExportReports from "@/components/agentguard/ExportReports";
import RealtimeMonitor from "@/components/agentguard/RealtimeMonitor";
import AuditLog from "@/components/agentguard/AuditLog";
import OnboardingTour from "@/components/agentguard/OnboardingTour";
import AgentKillSwitch from "@/components/agentguard/AgentKillSwitch";
import NotificationCenter from "@/components/agentguard/NotificationCenter";
import DateRangeFilter from "@/components/agentguard/DateRangeFilter";
import WebhookManager from "@/components/agentguard/WebhookManager";
import TeamWorkspace from "@/components/agentguard/TeamWorkspace";
import CostForecast from "@/components/agentguard/CostForecast";
import CostAnomalyAlert from "@/components/agentguard/CostAnomalyAlert";
import ThemeToggle from "@/components/agentguard/ThemeToggle";
import UsageAnalytics from "@/components/agentguard/UsageAnalytics";
import IDEContextPanel from "@/components/agentguard/IDEContextPanel";
import { useDevPulseIDE } from "@/context/DevPulseIDEContext";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  framework: string | null;
  status: "active" | "paused" | "stopped" | "error";
  max_cost_per_task: number | null;
  max_api_calls_per_min: number | null;
  max_reasoning_steps: number | null;
  budget_amount: number | null;
  total_cost: number;
  total_api_calls: number;
  total_tasks: number;
  created_at: string;
};

type Alert = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  agent_id: string | null;
};

const statusColors: Record<string, { dot: string; bg: string; text: string }> = {
  active: { dot: "bg-status-healthy", bg: "bg-status-healthy/10", text: "text-status-healthy" },
  paused: { dot: "bg-status-degraded", bg: "bg-status-degraded/10", text: "text-status-degraded" },
  stopped: { dot: "bg-muted-foreground", bg: "bg-muted/10", text: "text-muted-foreground" },
  error: { dot: "bg-status-down", bg: "bg-status-down/10", text: "text-status-down" },
};

const tabs = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "costs", label: "Cost Analytics", icon: BarChart3 },
  { id: "forecast", label: "AI Forecast", icon: TrendingUp },
  { id: "usage", label: "Usage", icon: PieChart },
  { id: "providers", label: "Providers", icon: Layers },
  { id: "performance", label: "Performance", icon: Star },
  { id: "flow", label: "Agent Flow", icon: Cpu },
  { id: "realtime", label: "Live Monitor", icon: Radio },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "webhooks", label: "Webhooks", icon: Zap },
  { id: "team", label: "Team", icon: Bot },
  { id: "audit", label: "Audit Log", icon: ScrollText },
  { id: "export", label: "Export", icon: Download },
] as const;

type TabId = typeof tabs[number]["id"];

const MAX_AGENTS_BY_TIER = { free: 0, pro: 10, team: 50 } as const;

export default function AgentGuardDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { tier } = useSubscription();
  const { tasksThisMonth } = useTasksThisMonth(user?.id);
  const maxAgents = MAX_AGENTS_BY_TIER[tier] ?? 1;
  const maxTasksFree = 100;
  const isFreeTier = tier === "free";
  const navigate = useNavigate();
  const { toast } = useToast();
  const { lastActionType, editorContext } = useDevPulseIDE();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // Guardrail: never render the dashboard for Free tier.
    if (!authLoading && tier === "free") navigate("/agentguard");
  }, [authLoading, tier, navigate]);

  useEffect(() => {
    if (!user) return;
    fetchData();
    const seen = localStorage.getItem("agentguard_onboarded");
    if (!seen) setShowOnboarding(true);
  }, [user]);

  useEffect(() => {
    if (lastActionType !== "devpulse:analyzeSelection") {
      return;
    }
    setActiveTab("overview");
    toast({
      title: "IDE selection received",
      description: editorContext?.relativePath
        ? `Ready to analyze code from ${editorContext.relativePath}`
        : "Ready to analyze selected code"
    });
  }, [lastActionType, editorContext?.relativePath, toast]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [agentsRes, alertsRes] = await Promise.all([
        supabase.from("agents").select("*").order("created_at", { ascending: false }),
        supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(20),
      ]);
      const agentList = (agentsRes.data || []) as Agent[];
      // Auto-pause agents that exceeded their pre-paid budget
      let didPause = false;
      for (const a of agentList) {
        if (a.budget_amount != null && Number(a.total_cost) >= a.budget_amount && a.status === "active") {
          await supabase.from("agents").update({ status: "paused" }).eq("id", a.id);
          a.status = "paused";
          didPause = true;
        }
      }
      if (didPause) {
        toast({ title: "Budget exceeded", description: "Agent(s) paused — cost reached pre-paid limit.", variant: "destructive" });
      }
      setAgents(agentList);
      if (alertsRes.data) setAlerts(alertsRes.data as Alert[]);
      if (agentsRes.error) toast({ title: "Error loading agents", description: agentsRes.error.message, variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Network error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddAgent = async (data: { name: string; description: string; framework: string }) => {
    if (!user) return;
    const { error } = await supabase.from("agents").insert({
      user_id: user.id, name: data.name,
      description: data.description || null, framework: data.framework || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Agent created" });
      await supabase.from("audit_log").insert({
        user_id: user.id, action: "agent_created",
        details: { name: data.name, framework: data.framework },
      });
      fetchData();
    }
    setShowAddAgent(false);
  };

  const handleToggleStatus = async (agent: Agent) => {
    if (!user) return;
    const newStatus = agent.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("agents").update({ status: newStatus }).eq("id", agent.id);
    if (!error) {
      await supabase.from("audit_log").insert({
        user_id: user.id, agent_id: agent.id,
        action: `agent_${newStatus}`, details: { previous_status: agent.status },
      });
      fetchData();
    }
  };

  const handleRunLoopDetection = async () => {
    if (!user) return;
    try {
      for (const agent of agents.filter(a => a.status === "active")) {
        await supabase.functions.invoke("loop-detection", {
          body: { agent_id: agent.id, user_id: user.id },
        });
      }
      toast({ title: "Loop detection scan complete" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRunLeakScan = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.functions.invoke("leak-scanner", {
        body: { user_id: user.id },
      });
      toast({
        title: "Leak scan complete",
        description: data?.leaks_found > 0 ? `Found ${data.leaks_found} potential leak(s)!` : "No leaks found.",
      });
      fetchData();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRunRateLimiter = async () => {
    if (!user) return;
    try {
      for (const agent of agents.filter(a => a.status === "active")) {
        await supabase.functions.invoke("rate-limiter", {
          body: { agent_id: agent.id, user_id: user.id },
        });
      }
      toast({ title: "Rate limit check complete" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Check failed", description: err.message, variant: "destructive" });
    }
  };

  const totalCost = useMemo(() => agents.reduce((s, a) => s + Number(a.total_cost), 0), [agents]);
  const totalCalls = useMemo(() => agents.reduce((s, a) => s + a.total_api_calls, 0), [agents]);
  const unreadAlerts = useMemo(() => alerts.filter(a => !a.is_read).length, [alerts]);
  const activeAgents = useMemo(() => agents.filter(a => a.status === "active").length, [agents]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {showOnboarding && (
        <OnboardingTour onComplete={() => {
          setShowOnboarding(false);
          localStorage.setItem("agentguard_onboarded", "true");
        }} />
      )}

      {/* Top nav */}
      <nav className="border-b border-border px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold font-serif text-foreground">
              Agent<span className="text-primary">Guard</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => navigate("/agentguard/docs")} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">SDK Docs</span>
            </button>
            <button onClick={() => navigate("/agentguard/settings")} className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              Settings
            </button>
            <ThemeToggle />
            <NotificationCenter alerts={alerts} onRefresh={fetchData} />
            <span className="text-sm text-muted-foreground font-mono hidden md:inline">{user?.email}</span>
            <button onClick={signOut} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Stats row */}
        <div className={`grid gap-3 sm:gap-4 mb-6 sm:mb-8 ${isFreeTier ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-4"}`}>
          {[
            { label: "Total Cost", value: `$${totalCost.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
            { label: "Active Agents", value: `${activeAgents}/${maxAgents}`, icon: Bot, color: "text-status-healthy" },
            { label: "API Calls", value: totalCalls.toLocaleString(), icon: Zap, color: "text-secondary" },
            { label: "Alerts", value: unreadAlerts, icon: AlertTriangle, color: "text-status-down" },
            ...(isFreeTier ? [{ label: "Tasks this month", value: `${tasksThisMonth}/${maxTasksFree}`, icon: Activity, color: tasksThisMonth >= maxTasksFree ? "text-status-down" : "text-muted-foreground" }] : []),
          ].map((stat) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-xl p-4 sm:p-5 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs sm:text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <p className={`text-2xl sm:text-3xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Burn rate projection */}
        <div className="mb-6">
          <BurnRateProjection userId={user!.id} />
        </div>

        {/* Cost anomaly alert */}
        <CostAnomalyAlert userId={user!.id} />

        {/* Security actions bar */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={handleRunLoopDetection}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl glass-card text-xs sm:text-sm text-muted-foreground hover:text-foreground border border-border transition-all">
            <Cpu className="w-4 h-4" /> <span className="hidden sm:inline">Run</span> Loop Detection
          </button>
          <button onClick={handleRunLeakScan}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl glass-card text-xs sm:text-sm text-muted-foreground hover:text-foreground border border-border transition-all">
            <Shield className="w-4 h-4" /> <span className="hidden sm:inline">Scan for</span> Leaks
          </button>
          <button onClick={handleRunRateLimiter}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl glass-card text-xs sm:text-sm text-muted-foreground hover:text-foreground border border-border transition-all">
            <Zap className="w-4 h-4" /> Rate Check
          </button>
        </div>

        <IDEContextPanel
          onAnalyzeSelection={() => {
            if (!editorContext?.selectedText?.trim()) {
              toast({ title: "No IDE selection", description: "Select code in VS Code and run Analyze Selected Code." });
              return;
            }
            toast({
              title: "Selection ready",
              description: "Use this context with your scans, monitoring, and runbooks in DevPulse."
            });
            setActiveTab("overview");
          }}
        />

        {/* Tabs - scrollable on mobile */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-hide">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "glass-card text-muted-foreground hover:text-foreground"
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold font-serif text-foreground">Your Agents</h2>
                <button onClick={() => setShowAddAgent(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                  <Plus className="w-4 h-4" /> Add Agent
                </button>
              </div>

              {loadingData ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="glass-card rounded-xl p-5 animate-pulse">
                      <div className="h-5 w-40 bg-muted/50 rounded mb-3" />
                      <div className="h-3 w-60 bg-muted/30 rounded" />
                    </div>
                  ))}
                </div>
              ) : agents.length === 0 ? (
                <div className="glass-card rounded-2xl p-8 sm:p-12 text-center border border-border">
                  <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No agents yet</h3>
                  <p className="text-muted-foreground mb-4">Add your first AI agent to start monitoring</p>
                  <button onClick={() => setShowAddAgent(true)}
                    className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
                    Add Agent
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agents.map((agent) => {
                    const sc = statusColors[agent.status] || statusColors.stopped;
                    return (
                      <motion.div key={agent.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="glass-card-hover rounded-xl p-5 border border-border cursor-pointer group"
                        onClick={() => navigate(`/agentguard/agent/${agent.id}`)}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${sc.dot} ${agent.status === "active" ? "animate-pulse-soft" : ""}`} />
                            <h3 className="font-semibold text-foreground">{agent.name}</h3>
                            {(() => {
                              const costPerTask = agent.total_tasks > 0 ? Number(agent.total_cost) / agent.total_tasks : 0;
                              const callsPerTask = agent.total_tasks > 0 ? agent.total_api_calls / agent.total_tasks : 0;
                              const health = Math.round(Math.max(0, Math.min(100, 100 - costPerTask * 15 - callsPerTask * 0.5)));
                              return (
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                  health >= 75 ? "bg-status-healthy/20 text-status-healthy" :
                                  health >= 50 ? "bg-status-degraded/20 text-status-degraded" : "bg-muted/50 text-muted-foreground"
                                }`} title="Health score">
                                  {health}
                                </span>
                              );
                            })()}
                          </div>
                          <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${sc.bg} ${sc.text}`}>{agent.status}</span>
                        </div>
                        {agent.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{agent.description}</p>}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div><p className="text-xs text-muted-foreground">Cost</p><p className={`font-mono text-sm ${agent.budget_amount != null && Number(agent.total_cost) >= (agent.budget_amount || 0) ? "text-status-down" : "text-foreground"}`}>${Number(agent.total_cost).toFixed(2)}{agent.budget_amount != null ? `/${agent.budget_amount}` : ""}</p></div>
                          <div><p className="text-xs text-muted-foreground">Calls</p><p className="font-mono text-sm text-foreground">{agent.total_api_calls}</p></div>
                          <div><p className="text-xs text-muted-foreground">Tasks</p><p className="font-mono text-sm text-foreground">{agent.total_tasks}</p></div>
                        </div>
                        {agent.framework && (
                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted/30 text-muted-foreground">{agent.framework}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleStatus(agent); }}
                              className={`text-xs font-medium ${agent.status === "active" ? "text-status-degraded" : "text-status-healthy"} hover:underline`}>
                              {agent.status === "active" ? "Pause" : "Resume"}
                            </button>
                            <div onClick={(e) => e.stopPropagation()}>
                              <AgentKillSwitch agentId={agent.id} agentName={agent.name} userId={user!.id} onKilled={fetchData} />
                            </div>
                          </div>
                          <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/agentguard/agent/${agent.id}?tab=replay`); }}
                              className="text-xs text-muted-foreground hover:text-primary transition-colors"
                              title="Replay"
                            >
                              Replay
                            </button>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "costs" && (
            <motion.div key="costs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold font-serif text-foreground">Cost Analytics</h3>
                <DateRangeFilter onRangeChange={() => {}} />
              </div>
              <AgentCostChart userId={user!.id} />
            </motion.div>
          )}

          {activeTab === "forecast" && (
            <motion.div key="forecast" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CostForecast userId={user!.id} />
            </motion.div>
          )}

          {activeTab === "usage" && (
            <motion.div key="usage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <UsageAnalytics userId={user!.id} />
            </motion.div>
          )}

          {activeTab === "providers" && (
            <motion.div key="providers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ProviderComparison userId={user!.id} />
            </motion.div>
          )}

          {activeTab === "performance" && (
            <motion.div key="performance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AgentHealthScore agents={agents} />
            </motion.div>
          )}

          {activeTab === "flow" && (
            <motion.div key="flow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AgentFlowView agents={agents} userId={user!.id} />
            </motion.div>
          )}

          {activeTab === "realtime" && (
            <motion.div key="realtime" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RealtimeMonitor />
            </motion.div>
          )}

          {activeTab === "alerts" && (
            <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AlertsFeed alerts={alerts} onRefresh={fetchData} />
            </motion.div>
          )}

          {activeTab === "webhooks" && (
            <motion.div key="webhooks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <WebhookManager userId={user!.id} />
            </motion.div>
          )}

          {activeTab === "team" && (
            <motion.div key="team" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TeamWorkspace userId={user!.id} />
            </motion.div>
          )}

          {activeTab === "audit" && (
            <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AuditLog userId={user!.id} />
            </motion.div>
          )}

          {activeTab === "export" && (
            <motion.div key="export" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ExportReports userId={user!.id} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AddAgentModal
        isOpen={showAddAgent}
        onClose={() => setShowAddAgent(false)}
        onAdd={handleAddAgent}
        maxAgents={maxAgents}
        currentAgentCount={agents.length}
      />
    </div>
  );
}
