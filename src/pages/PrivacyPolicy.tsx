export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold font-serif text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: March 19, 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Data We Collect</h2>
          <p className="text-sm text-muted-foreground">
            We collect account details (email, profile metadata), usage telemetry (agent events, logs, billing usage), and
            support communications to provide and improve DevPulse and AgentGuard.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">How We Use Data</h2>
          <p className="text-sm text-muted-foreground">
            Data is used for authentication, billing, analytics, abuse prevention, feature delivery, and customer support.
            We do not sell personal information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Retention and Security</h2>
          <p className="text-sm text-muted-foreground">
            Data is retained only as long as needed for operational and legal purposes. We use industry-standard controls,
            encryption in transit, and access restrictions for sensitive systems.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Your Rights</h2>
          <p className="text-sm text-muted-foreground">
            You may request access, correction, or deletion of your account data by contacting us at support@devpluse.in.
          </p>
        </section>
      </div>
    </main>
  );
}
