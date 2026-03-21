import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, ScrollText } from "lucide-react";
import { api } from "@/lib/api";

type CheckRow = {
  id: string;
  control_name: string;
  status: string;
  evidence: string;
  checked_at?: string;
};

type Props = { userId: string };

const statusStyle: Record<string, string> = {
  compliant: "text-status-healthy bg-status-healthy/10 border-status-healthy/25",
  non_compliant: "text-status-down bg-status-down/10 border-status-down/25",
  partial: "text-status-degraded bg-status-degraded/10 border-status-degraded/25",
};

export default function CompliancePanel({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCompliance(userId);
      setChecks((res.checks || []) as CheckRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load compliance");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runCheck = async (controlName: string) => {
    const evidence = draft[controlName] ?? "";
    setRunning(controlName);
    setError(null);
    try {
      await api.runComplianceCheck({ user_id: userId, control_name: controlName, evidence });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setRunning(null);
    }
  };

  const downloadReport = () => {
    const lines = [
      "DevPulse — PCI DSS v4.0.1 style controls (evidence report)",
      `Generated: ${new Date().toISOString()}`,
      "",
      ...checks.map(
        (c) =>
          `## ${c.status.toUpperCase()} — ${c.control_name}\nEvidence:\n${c.evidence || "(none)"}\nChecked: ${c.checked_at || "—"}\n`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devpulse-compliance-${userId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading compliance…
      </div>
    );
  }

  if (error && checks.length === 0) {
    return (
      <div className="glass-card rounded-2xl border border-status-down/25 p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <p className="text-sm text-status-down">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold font-serif text-foreground">Compliance</h2>
            <p className="text-sm text-muted-foreground">PCI DSS–style controls (seeded when empty). Submit evidence and run checks.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={downloadReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Generate evidence report
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-status-down">{error}</p>}

      <div className="space-y-4">
        {checks.map((c) => {
          const st = String(c.status || "").toLowerCase();
          const badge = statusStyle[st] || "text-muted-foreground bg-muted/20 border-border";
          return (
            <div key={c.id} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <h3 className="font-medium text-foreground">{c.control_name}</h3>
                <span className={`text-xs font-mono px-2 py-0.5 rounded-md border ${badge}`}>{c.status}</span>
              </div>
              {c.evidence ? <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.evidence}</p> : null}
              <textarea
                value={draft[c.control_name] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [c.control_name]: e.target.value }))}
                placeholder="Paste evidence notes (e.g. TLS 1.3 enabled, WAF vendor, MFA rollout)…"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-muted/20 border border-border text-sm text-foreground outline-none focus:border-primary/30 resize-y"
              />
              <button
                type="button"
                disabled={running === c.control_name}
                onClick={() => void runCheck(c.control_name)}
                className="text-sm px-4 py-2 rounded-xl bg-secondary/20 text-secondary-foreground hover:bg-secondary/30 disabled:opacity-50"
              >
                {running === c.control_name ? "Running…" : "Run check with evidence"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
