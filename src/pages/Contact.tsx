export default function Contact() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold font-serif text-foreground">Contact</h1>
        <p className="text-sm text-muted-foreground">We usually respond within one business day.</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Support</h2>
          <p className="text-sm text-muted-foreground">support@devpluse.in</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Billing</h2>
          <p className="text-sm text-muted-foreground">billing@devpluse.in</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Sales</h2>
          <p className="text-sm text-muted-foreground">sales@devpluse.in</p>
        </section>
      </div>
    </main>
  );
}
