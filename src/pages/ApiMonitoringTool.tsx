import { Link } from "react-router-dom";

export default function ApiMonitoringTool() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <article className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
            API Monitoring Tool for Real-Time Health, Latency, and Reliability
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            DEVPULSE helps developers monitor API uptime, response time, and failure trends in real time.
            If you rely on external APIs for production traffic, continuous API health visibility reduces outages and
            improves release confidence.
          </p>
        </header>

        <section className="glass-card rounded-2xl border border-border p-6 space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">Why teams use DEVPULSE for API monitoring</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Real-time API probes with status and latency tracking.</li>
            <li>Historical incident context for degradation and downtime patterns.</li>
            <li>Compatibility intelligence to evaluate APIs before deep integration.</li>
            <li>Developer-focused workflows: docs discovery and integration code support.</li>
          </ul>
        </section>

        <section className="glass-card rounded-2xl border border-border p-6 space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">Best fit use cases</h2>
          <p className="text-muted-foreground">
            DEVPULSE is ideal for startups, SaaS teams, and internal platform teams that depend on third-party APIs
            such as payments, AI providers, weather/geo APIs, data APIs, and cloud service endpoints.
          </p>
          <p className="text-muted-foreground">
            It is especially useful when you need one place to monitor operational health and understand API
            integration risk.
          </p>
        </section>

        <section className="flex gap-3 flex-wrap">
          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Open Live Dashboard
          </Link>
          <Link
            to="/agentguard"
            className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
          >
            Explore AgentGuard
          </Link>
        </section>
      </article>
    </main>
  );
}

