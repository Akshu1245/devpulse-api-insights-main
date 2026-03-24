import { Link } from "react-router-dom";

export default function AiAgentSecurityPlatform() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <article className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
            AI Agent Security Platform with Cost and Risk Guardrails
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            AgentGuard by DEVPULSE gives teams practical controls for AI agent operations: spend visibility, security
            checks, policy-style workflows, and auditability for production deployments.
          </p>
        </header>

        <section className="glass-card rounded-2xl border border-border p-6 space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">Core AgentGuard capabilities</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Runtime scans for loops, leak indicators, and rate pressure.</li>
            <li>Cost analytics and trend-based forecasting for proactive budget control.</li>
            <li>Alert workflows, webhooks, and activity-level audit records.</li>
            <li>Team and workspace collaboration patterns for operational governance.</li>
          </ul>
        </section>

        <section className="glass-card rounded-2xl border border-border p-6 space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">Who this page is for</h2>
          <p className="text-muted-foreground">
            Engineering teams shipping AI copilots, internal agent automations, and customer-facing AI workflows can
            use AgentGuard to reduce risk while keeping usage and cost performance measurable.
          </p>
        </section>

        <section className="flex gap-3 flex-wrap">
          <Link
            to="/agentguard"
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Open AgentGuard
          </Link>
          <Link
            to="/agentguard/docs"
            className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
          >
            Read SDK Docs
          </Link>
        </section>
      </article>
    </main>
  );
}

