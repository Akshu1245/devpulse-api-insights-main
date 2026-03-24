import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Shield, Bot, Save, Loader2, Activity, DollarSign,
  Zap, Clock, Settings, BarChart3, ScrollText, Play, Wallet, AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import AgentReplay from "@/components/agentguard/AgentReplay";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  framework: string | null;
  status: string;
  max_cost_per_task: number | null;
  max_api_calls_per_min: number | null;
  max_reasoning_steps: number | null;
  budget_amount: number | null;
  total_cost: number;
  total_api_calls: number;
  total_tasks: number;
  created_at: string;
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

export default function AgentGuardAgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [costData, setCostData] = useState<{ date: string; cost: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "config" | "logs" | "replay">("overview");

  // Deep link: ?tab=replay opens Replay tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "replay") setActiveTab("replay");
  }, []);

  // Editable config
  const [config, setConfig] = useState({
    name: "",
    description: "",
    framework: "",
    max_cost_per_task: 2,
    max_api_calls_per_min: 50,
    max_reasoning_steps: 25,
    budget_amount: null as number | null,
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || !agentId) return;
    fetchAgent();
  }, [user, agentId]);

  const fetchAgent = async () => {
    setLoading(true);
    const [agentRes, logsRes, costsRes] = await Promise.all([
      supabase.from("agents").select("*").eq("id", agentId!).single(),
      supabase.from("agent_logs").select("id, action_type, provider, model, cost, latency_ms, step_number, task_id, is_loop_detected, created_at")
        .eq("agent_id", agentId!).order("created_at", { ascending: false }).limit(50),
      supabase.from("cost_entries").select("date, cost").eq("agent_id", agentId!).order("date", { ascending: true }).limit(30),
    ]);

    if (agentRes.data) {
      const a = agentRes.data as Agent;
      setAgent(a);
      setConfig({
        name: a.name,
        description: a.description || "",
        framework: a.framework || "",
        max_cost_per_task: a.max_cost_per_task ?? 2,
        max_api_calls_per_min: a.max_api_calls_per_min ?? 50,
        max_reasoning_steps: a.max_reasoning_steps ?? 25,
        budget_amount: a.budget_amount ?? null,
      });
    }
    if (logsRes.data) setLogs(logsRes.data as LogEntry[]);
    if (costsRes.data) {
      const grouped: Record<string, number> = {};
      costsRes.data.forEach((e: any) => { grouped[e.date] = (grouped[e.date] || 0) + Number(e.cost); });
      setCostData(Object.entries(grouped).map(([date, cost]) => ({ date, cost: Number(cost.toFixed(4)) })));
    }
    setLoading(false);
  };

  const handleSaveConfig = async () => {
    if (!agent || !user) return;
    setSaving(true);
    const { error } = await supabase.from("agents").update({
      name: config.name,
      description: config.description || null,
      framework: config.framework || null,
      max_cost_per_task: config.max_cost_per_task,
      max_api_calls_per_min: config.max_api_calls_per_min,
      max_reasoning_steps: config.max_reasoning_steps,
    }).eq("id", agent.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("audit_log").insert({
        user_id: user.id, agent_id: agent.id,
        action: "agent_config_updated", details: config,
      });
      toast({ title: "Configuration saved" });
      fetchAgent();
    }
    setSaving(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground">Agent not found</h2>
          <button onClick={() => navigate("/agentguard")} className="mt-4 text-sm text-primary hover:underline">← Back to dashboard</button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: BarChart3 },
    { id: "replay" as const, label: "Replay", icon: Play },
    { id: "config" as const, label: "Configuration", icon: Settings },
    { id: "logs" as const, label: "Execution Logs", icon: ScrollText },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/agentguard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Shield className="w-5 h-5 text-primary" />
          <span className="text-sm text-muted-foreground">AgentGuard</span>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-lg font-bold text-foreground">{agent.name}</h1>
          <span className={`ml-2 text-xs font-mono px-2 py-0.5 rounded-lg ${
            agent.status === "active" ? "bg-status-healthy/10 text-status-healthy" :
            agent.status === "paused" ? "bg-status-degraded/10 text-status-degraded" :
            "bg-muted/30 text-muted-foreground"
          }`}>{agent.status}</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Cost", value: `$${Number(agent.total_cost).toFixed(2)}`, icon: DollarSign, color: "text-primary" },
            { label: "API Calls", value: agent.total_api_calls.toLocaleString(), icon: Zap, color: "text-secondary" },
            { label: "Tasks", value: agent.total_tasks, icon: Activity, color: "text-accent" },
            { label: "Created", value: new Date(agent.created_at).toLocaleDateString(), icon: Clock, color: "text-muted-foreground" },
          ].map((s) => (
            <div key={s.label} className="glass-card rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
            </div>
          ))}
          {agent.budget_amount != null && (
            <div className={`glass-card rounded-xl p-4 border col-span-2 md:col-span-1 ${
              Number(agent.total_cost) >= (agent.budget_amount || 0) ? "border-status-down/50" : "border-border"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">Budget</span>
              </div>
              <p className={`text-2xl font-bold font-mono ${Number(agent.total_cost) >= (agent.budget_amount || 0) ? "text-status-down" : "text-foreground"}`}>
                ${Number(agent.total_cost).toFixed(2)} / ${agent.budget_amount}
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    Number(agent.total_cost) >= (agent.budget_amount || 0) ? "bg-status-down" :
                    (Number(agent.total_cost) / (agent.budget_amount || 1)) >= 0.8 ? "bg-status-degraded" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(100, (Number(agent.total_cost) / (agent.budget_amount || 1)) * 100)}%` }}
                />
              </div>
              {Number(agent.total_cost) >= (agent.budget_amount || 0) && (
                <p className="text-xs text-status-down flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" /> Budget exhausted — pause agent
                </p>
              )}
              {(Number(agent.total_cost) / (agent.budget_amount || 1)) >= 0.8 && Number(agent.total_cost) < (agent.budget_amount || 0) && (
                <p className="text-xs text-status-degraded flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" /> Approaching budget limit
                </p>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "glass-card text-muted-foreground hover:text-foreground"
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {costData.length > 0 ? (
              <div className="glass-card rounded-xl p-6 border border-border">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Daily Cost Trend</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={costData}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(225, 10%, 50%)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(225, 10%, 50%)" }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={{ background: "hsl(225,14%,9%)", border: "1px solid hsl(225,10%,16%)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`$${v.toFixed(4)}`, "Cost"]} />
                    <Bar dataKey="cost" fill="hsl(34, 80%, 56%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="glass-card rounded-xl p-8 border border-border text-center text-muted-foreground text-sm">
                No cost data yet for this agent.
              </div>
            )}

            {agent.description && (
              <div className="glass-card rounded-xl p-5 border border-border">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
                <p className="text-foreground text-sm">{agent.description}</p>
              </div>
            )}

            <div className="glass-card rounded-xl p-5 border border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Current Limits</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Max Cost/Task</p>
                  <p className="font-mono text-foreground">${agent.max_cost_per_task ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Max Calls/Min</p>
                  <p className="font-mono text-foreground">{agent.max_api_calls_per_min ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Max Steps</p>
                  <p className="font-mono text-foreground">{agent.max_reasoning_steps ?? "—"}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Config Editor */}
        {activeTab === "config" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-xl p-6 border border-border space-y-5">
            <h3 className="text-lg font-semibold font-serif text-foreground">Agent Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Agent Name</label>
                <input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Framework</label>
                <input value={config.framework} onChange={(e) => setConfig({ ...config, framework: e.target.value })}
                  placeholder="LangChain, CrewAI, OpenAI..."
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <textarea value={config.description} onChange={(e) => setConfig({ ...config, description: e.target.value })}
                rows={3} placeholder="What does this agent do?"
                className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>

            <div className="divider-gradient" />

            <h4 className="text-sm font-medium text-foreground">Safety Limits</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Max Cost per Task ($)</label>
                <input type="number" step="0.1" min="0" value={config.max_cost_per_task}
                  onChange={(e) => setConfig({ ...config, max_cost_per_task: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Max API Calls/Min</label>
                <input type="number" min="1" value={config.max_api_calls_per_min}
                  onChange={(e) => setConfig({ ...config, max_api_calls_per_min: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Max Reasoning Steps</label>
                <input type="number" min="1" value={config.max_reasoning_steps}
                  onChange={(e) => setConfig({ ...config, max_reasoning_steps: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>

            <button onClick={handleSaveConfig} disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Configuration
            </button>
          </motion.div>
        )}

        {/* Replay */}
        {activeTab === "replay" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AgentReplay logs={logs} agentName={agent.name} />
          </motion.div>
        )}

        {/* Execution Logs */}
        {activeTab === "logs" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {logs.length === 0 ? (
              <div className="glass-card rounded-xl p-8 border border-border text-center text-muted-foreground text-sm">
                No execution logs yet.
              </div>
            ) : (
              <div className="glass-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="text-left p-3 text-muted-foreground font-medium">Time</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Step</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Action</th>
                      <th className="text-left p-3 text-muted-foreground font-medium hidden sm:table-cell">Provider</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Cost</th>
                      <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">Latency</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">Loop</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className={`border-b border-border/30 ${log.is_loop_detected ? "bg-status-down/5" : ""}`}>
                        <td className="p-3 font-mono text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</td>
                        <td className="p-3 font-mono text-foreground">{log.step_number}</td>
                        <td className="p-3 text-foreground">{log.action_type}</td>
                        <td className="p-3 text-muted-foreground hidden sm:table-cell">{log.provider || "—"}</td>
                        <td className="p-3 text-right font-mono text-foreground">{log.cost ? `$${Number(log.cost).toFixed(4)}` : "—"}</td>
                        <td className="p-3 text-right font-mono text-muted-foreground hidden md:table-cell">{log.latency_ms ? `${log.latency_ms}ms` : "—"}</td>
                        <td className="p-3 text-center">{log.is_loop_detected ? <span className="text-status-down">⚠</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
