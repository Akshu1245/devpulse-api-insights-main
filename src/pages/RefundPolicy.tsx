export default function RefundPolicy() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold font-serif text-foreground">Refund Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: March 19, 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Trials and Cancellations</h2>
          <p className="text-sm text-muted-foreground">
            Trial terms are shown during checkout. You can cancel anytime from the billing portal before renewal to avoid
            future charges.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Refund Eligibility</h2>
          <p className="text-sm text-muted-foreground">
            Refunds are reviewed case-by-case for duplicate charges, billing errors, or material service issues.
            Subscription fees already used for active service periods are generally non-refundable.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">How to Request</h2>
          <p className="text-sm text-muted-foreground">
            Send your account email, charge date, and reason to billing@devpluse.in within 7 days of the charge.
          </p>
        </section>
      </div>
    </main>
  );
}
