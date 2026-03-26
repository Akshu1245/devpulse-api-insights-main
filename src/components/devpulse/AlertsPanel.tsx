import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

type AlertRow = {
  id: string;
  severity: string;
  description: string;
  endpoint: string;
  created_at?: string;
};

export default function AlertsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAlerts();
      setAlerts((res.alerts || []) as AlertRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (id: string) => {
    setResolving(id);
    try {
      await api.resolveAlert(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve alert");
    } finally {
      setResolving(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading alerts…
      </div>
    );
  }

  if (error) {
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

  if (alerts.length === 0) {
    return (
      <div className="glass-card rounded-2xl border border-border p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
        <Bell className="w-8 h-8 opacity-40" />
        No active alerts. Your scanned endpoints have no unresolved critical or high items from the security scanner.
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold font-serif text-foreground">Active alerts</h2>
        </div>
        <button type="button" onClick={() => void load()} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>
      <ul className="space-y-3">
        {alerts.map((a) => (
          <li key={a.id} className="rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="min-w-0">
              <span className="text-xs font-mono uppercase text-status-down">{a.severity}</span>
              <p className="text-sm text-foreground mt-1">{a.description}</p>
              <p className="text-xs font-mono text-muted-foreground mt-1 break-all">{a.endpoint}</p>
            </div>
            <button
              type="button"
              disabled={resolving === a.id}
              onClick={() => void resolve(a.id)}
              className="shrink-0 px-4 py-2 rounded-xl bg-muted/40 text-sm hover:bg-muted/60 disabled:opacity-50"
            >
              {resolving === a.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Mark resolved"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
