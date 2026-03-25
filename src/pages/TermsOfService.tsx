export default function TermsOfService() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold font-serif text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: March 19, 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Service Scope</h2>
          <p className="text-sm text-muted-foreground">
            DevPulse and AgentGuard are provided as software services for API intelligence, monitoring, and agent
            observability. Features may evolve over time.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Account Responsibilities</h2>
          <p className="text-sm text-muted-foreground">
            You are responsible for account security, API credentials connected to your account, and compliance with
            applicable laws and third-party API terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Billing</h2>
          <p className="text-sm text-muted-foreground">
            Paid plans are billed through Stripe subscriptions. Prices, trial terms, and limits are shown at checkout.
            Taxes may apply based on jurisdiction.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Disclaimer</h2>
          <p className="text-sm text-muted-foreground">
            Services are provided on an as-is basis without warranties of uninterrupted availability. To the extent
            permitted by law, liability is limited to fees paid in the prior 12 months.
          </p>
        </section>
      </div>
    </main>
  );
}
