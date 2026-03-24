import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, User, Save, Loader2, Crown, Zap, Bot, CreditCard, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { PLATFORM_PLANS } from "@/data/pricing";

type Profile = {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: string;
  max_agents: number;
};

const plans = PLATFORM_PLANS.map((p) => ({
  id: p.id as "free" | "pro" | "team",
  name: p.name,
  price: p.price,
  period: p.period === "/forever" ? "/forever" : "/mo",
  agents: p.agents,
  maxTasks: p.tasksPerMonth,
  features: p.features,
}));

export default function AgentGuardSettings() {
  const { user, loading: authLoading } = useAuth();
  const { tier, subscribed, subscriptionEnd, loading: subLoading, checkout, manageSubscription, refresh } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const startHandledRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user]);

  // Check for checkout success/cancel or ?start=pro|team (from home card)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast({ title: "Subscription activated!", description: "Your plan has been upgraded." });
      refresh();
      window.history.replaceState({}, "", "/agentguard/settings");
      return;
    }
    const start = params.get("start") as "pro" | "team" | null;
    if ((start === "pro" || start === "team") && user && !subLoading && !startHandledRef.current) {
      startHandledRef.current = true;
      window.history.replaceState({}, "", "/agentguard/settings");
      setCheckingOut(start);
      checkout(start).catch((err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" })).finally(() => setCheckingOut(null));
    }
  }, [user, subLoading, checkout, toast, refresh]);

  const fetchProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
    if (data) {
      setProfile(data as Profile);
      setDisplayName(data.display_name || "");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("user_id", user.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      fetchProfile();
    }
    setSaving(false);
  };

  const handleCheckout = async (planId: "pro" | "team") => {
    setCheckingOut(planId);
    try {
      await checkout(planId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCheckingOut(null);
    }
  };

  const handleManage = async () => {
    try {
      await manageSubscription();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/agentguard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold font-serif text-foreground">Settings</h1>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Profile */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl p-6 border border-border">
          <div className="flex items-center gap-3 mb-6">
            <User className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold font-serif text-foreground">Profile</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <p className="text-sm font-mono text-foreground bg-muted/20 px-4 py-2.5 rounded-xl border border-border">{user?.email}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </button>
          </div>
        </motion.div>

        {/* Billing */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Crown className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold font-serif text-foreground">Subscription Plan</h2>
            </div>
            {subscribed && (
              <button onClick={handleManage}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <CreditCard className="w-4 h-4" />
                Manage Billing <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          {subscribed && subscriptionEnd && (
            <div className="glass-card rounded-xl p-4 border border-primary/30 mb-4">
              <p className="text-sm text-foreground">
                Current plan: <span className="font-bold text-primary capitalize">{tier}</span>
                {" · "}Renews {new Date(subscriptionEnd).toLocaleDateString()}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = tier === plan.id;
              return (
                <div key={plan.id} className={`glass-card rounded-xl p-5 border transition-all ${
                  isCurrent ? "border-primary/50 ring-1 ring-primary/20" : "border-border"
                }`}>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full mb-3">
                      <Zap className="w-2.5 h-2.5" /> Current Plan
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                  <div className="mt-1">
                    <span className="text-2xl font-bold font-mono text-primary">{plan.price}</span>
                    <span className="text-xs text-muted-foreground">{plan.period}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                    <Bot className="w-3 h-3" />
                    Up to {plan.agents} agents
                  </div>
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && plan.id !== "free" && (
                    <button
                      onClick={() => handleCheckout(plan.id as "pro" | "team")}
                      disabled={checkingOut !== null}
                      className="mt-4 w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                      {checkingOut === plan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {tier === "free" ? "Upgrade" : "Switch Plan"}
                    </button>
                  )}
                  {!isCurrent && plan.id === "free" && subscribed && (
                    <button onClick={handleManage}
                      className="mt-4 w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
                      Downgrade
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Account Stats */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-6 border border-border">
          <h2 className="text-lg font-semibold font-serif text-foreground mb-4">Account Info</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="font-medium text-foreground capitalize">{tier}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Max Agents</p>
              <p className="font-mono text-foreground">{tier === "team" ? 50 : tier === "pro" ? 10 : 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">User ID</p>
              <p className="font-mono text-foreground text-xs truncate">{user?.id?.slice(0, 8)}...</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Member Since</p>
              <p className="font-mono text-foreground text-xs">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
