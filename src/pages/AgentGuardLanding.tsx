import { motion } from "framer-motion";
import {
  Shield, Bot, DollarSign, Zap, Activity, Lock, Users, BarChart3,
  ArrowRight, CheckCircle2, ChevronRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PLATFORM_PLANS } from "@/data/pricing";

const features = [
  { icon: Bot, title: "Agent Monitoring", desc: "Track every AI agent's actions, costs, and API calls in real-time with live dashboards." },
  { icon: Shield, title: "Security Engine", desc: "Automated loop detection, API key leak scanning, and emergency kill switches." },
  { icon: DollarSign, title: "Cost Analytics", desc: "Per-agent cost breakdowns by provider, model, and time with AI-powered forecasting." },
  { icon: Zap, title: "Webhooks & Alerts", desc: "Instant Slack, Discord, and email notifications when security events fire." },
  { icon: Users, title: "Team Workspaces", desc: "Invite members, assign roles, and share agent dashboards across your organization." },
  { icon: BarChart3, title: "Performance Scoring", desc: "0-100 efficiency scores with latency, cost, and reliability benchmarks." },
];

export default function AgentGuardLanding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold font-serif text-foreground">
              Agent<span className="text-primary">Guard</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/auth")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </button>
            <button onClick={() => navigate("/auth")}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              Get Started Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="ambient-bg absolute inset-0 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-32 text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 mb-6">
              <Activity className="w-3 h-3" /> Now in Public Beta
            </span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-serif text-foreground mb-6 leading-tight">
              Monitor & Protect<br />
              <span className="text-glow-primary text-primary">Your AI Agents</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Real-time cost tracking, security guardrails, and performance analytics for every AI agent you deploy. Stop runaway costs before they happen.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <button onClick={() => navigate("/auth")}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
                Start Free <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate("/agentguard/docs")}
                className="flex items-center gap-2 px-6 py-3 rounded-xl glass-card text-foreground font-medium hover:border-primary/30 transition-all">
                View SDK Docs <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="divider-gradient" />

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold font-serif text-foreground mb-4">Everything you need to ship safely</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">A complete observability and security platform built specifically for autonomous AI agents.</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="glass-card-hover rounded-xl p-6 border border-border">
              <f.icon className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="divider-gradient" />

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold font-serif text-foreground mb-4">Simple, transparent pricing</h2>
          <p className="text-muted-foreground">Free: main project only. AgentGuard trials require a credit card. Cancel anytime.</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {PLATFORM_PLANS.map((plan, i) => (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className={`rounded-xl p-6 border ${
                plan.highlighted
                  ? "border-primary/50 ring-2 ring-primary/20 glass-card relative"
                  : "border-border glass-card"
              }`}>
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-4xl font-bold font-mono text-primary">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {plan.agents > 0 ? `Up to ${plan.agents} agents` : "No AgentGuard"} · {plan.apis} API monitors
              </p>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
                <button onClick={() => navigate("/auth")}
                className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                }`}>
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="glass-card rounded-2xl p-12 text-center border border-border relative overflow-hidden">
          <div className="ambient-bg absolute inset-0 pointer-events-none" />
          <div className="relative z-10">
            <Lock className="w-10 h-10 text-primary mx-auto mb-4" />
            <h2 className="text-3xl font-bold font-serif text-foreground mb-4">Ready to protect your AI agents?</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Join hundreds of teams using AgentGuard to monitor costs, catch security issues, and ship AI products with confidence.
            </p>
            <button onClick={() => navigate("/auth")}
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
              Get Started Free
            </button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-serif text-foreground">AgentGuard</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <button onClick={() => navigate("/agentguard/docs")} className="hover:text-foreground transition-colors">Docs</button>
            <button onClick={() => navigate("/auth")} className="hover:text-foreground transition-colors">Sign In</button>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 AgentGuard. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
