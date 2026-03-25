const faqItems = [
  {
    q: "What is DEVPULSE used for?",
    a: "DEVPULSE is used to monitor API health in real time, compare API compatibility, and speed up integration work with generated code and docs.",
  },
  {
    q: "Does DEVPULSE show live data?",
    a: "Yes. The API Health Monitor probes API endpoints at runtime and displays current status, latency, and response health metrics.",
  },
  {
    q: "What is AgentGuard in DEVPULSE?",
    a: "AgentGuard is the AI agent security and cost control layer. It helps detect risky behavior, monitor spend, and apply operational guardrails.",
  },
  {
    q: "Who should use DEVPULSE?",
    a: "Developers, startup teams, and platform engineers who rely on third-party APIs and need reliability, visibility, and faster troubleshooting.",
  },
  {
    q: "Can I use my own API keys?",
    a: "Yes. You can add your own provider keys to test and monitor key-protected APIs with your actual access level and quotas.",
  },
];

export default function HomeSeoContent() {
  return (
    <section id="learn" className="py-24 px-6">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="glass-card rounded-2xl border border-border p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground mb-4">
            API Monitoring Built for Real-World Reliability
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            DEVPULSE helps teams track API uptime, latency, and degradation patterns before incidents impact users.
            Instead of checking dashboards manually, you get a continuous, real-time view of API health and agent behavior.
            This makes it easier to catch failures early, choose better integrations, and ship with more confidence.
          </p>
        </div>

        <div className="glass-card rounded-2xl border border-border p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground mb-4">
            How DEVPULSE Helps Teams Ship Faster
          </h2>
          <div className="space-y-3 text-muted-foreground">
            <p>
              <span className="text-foreground font-medium">Real-time API health monitoring:</span> Track status, latency,
              and incident trends to quickly identify unstable providers.
            </p>
            <p>
              <span className="text-foreground font-medium">Compatibility intelligence:</span> Find APIs that fit together
              so integrations are easier and less risky.
            </p>
            <p>
              <span className="text-foreground font-medium">Developer acceleration:</span> Generate practical code patterns
              and search documentation faster during implementation.
            </p>
            <p>
              <span className="text-foreground font-medium">AgentGuard security:</span> Apply controls for AI agent usage,
              spend boundaries, and operational safety.
            </p>
          </div>
        </div>

        <div className="glass-card rounded-2xl border border-border p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground mb-5">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <details key={item.q} className="rounded-xl border border-border p-4 bg-muted/10">
                <summary className="cursor-pointer text-foreground font-medium">{item.q}</summary>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl border border-border p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground mb-4">
            Explore More SEO Pages
          </h2>
          <p className="text-muted-foreground mb-4">
            These pages target high-intent searches such as API monitoring tool comparisons and AI agent security
            platform evaluation.
          </p>
          <div className="flex gap-3 flex-wrap">
            <a href="/api-monitoring-tool" className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 transition-all">
              API Monitoring Tool
            </a>
            <a href="/ai-agent-security-platform" className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 transition-all">
              AI Agent Security Platform
            </a>
            <a href="/api-monitoring-alternatives" className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 transition-all">
              API Monitoring Alternatives
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

