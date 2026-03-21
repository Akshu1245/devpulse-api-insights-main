import { Link } from "react-router-dom";

const alternatives = [
  "Postman Monitors",
  "Better Stack",
  "Pingdom",
  "Checkly",
  "Datadog",
];

export default function ApiMonitoringAlternatives() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <article className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
            API Monitoring Alternatives for Developer Teams
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            If you are comparing DEVPULSE with options such as Postman Monitors, Better Stack, Pingdom, Checkly, or
            Datadog, this page clarifies where DEVPULSE is strongest: API-first visibility, compatibility intelligence,
            and AI agent safety controls in one workflow.
          </p>
        </header>

        <section className="glass-card rounded-2xl border border-border p-6">
          <h2 className="text-2xl font-semibold text-foreground mb-3">Common alternatives teams evaluate</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            {alternatives.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>

        <section className="glass-card rounded-2xl border border-border p-6 space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">When DEVPULSE is a strong choice</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>You want real-time API monitoring plus integration-focused developer tooling.</li>
            <li>You need compatibility and discovery signals before committing to providers.</li>
            <li>You need AI agent operational safeguards in the same platform.</li>
          </ul>
        </section>

        <section className="flex gap-3 flex-wrap">
          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Try DEVPULSE
          </Link>
          <Link
            to="/api-monitoring-tool"
            className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
          >
            API Monitoring Features
          </Link>
        </section>
      </article>
    </main>
  );
}

