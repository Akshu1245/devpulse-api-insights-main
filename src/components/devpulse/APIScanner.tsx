import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ScanSearch } from "lucide-react";
import { api } from "@/lib/api";

type ScanRow = {
  id?: string;
  endpoint: string;
  method: string;
  risk_level: string;
  issue: string;
  recommendation: string;
  scanned_at?: string;
};

type Props = { userId: string };

const riskClass: Record<string, string> = {
  critical: "bg-status-down/15 text-status-down border-status-down/30",
  high: "bg-status-down/10 text-orange-400 border-orange-400/30",
  medium: "bg-status-degraded/15 text-status-degraded border-status-degraded/30",
  low: "bg-muted/30 text-muted-foreground border-border",
};

export default function APIScanner({ userId }: Props) {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const loadScans = useCallback(async () => {
    setListError(null);
    setLoadingList(true);
    try {
      const res = await api.getUserScans(userId);
      setRows((res.scans || []) as ScanRow[]);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load scans");
    } finally {
      setLoadingList(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  const onScan = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter a URL to scan.");
      return;
    }
    setError(null);
    setScanning(true);
    try {
      await api.scanEndpoint(trimmed, userId);
      await loadScans();
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <ScanSearch className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold font-serif text-foreground">API security scanner</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Sends GET and POST requests from the backend and evaluates response headers for common misconfigurations. Results are stored per user.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/health"
          className="flex-1 px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm outline-none focus:border-primary/30"
          disabled={scanning}
        />
        <button
          type="button"
          onClick={() => void onScan()}
          disabled={scanning}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {scanning ? "Scanning…" : "Scan now"}
        </button>
      </div>
      {error && (
        <div className="mb-4 text-sm text-status-down flex flex-wrap items-center gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => void onScan()} className="text-primary hover:underline text-xs font-medium">
            Retry
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-foreground">Scan history</h3>
        <button
          type="button"
          onClick={() => void loadScans()}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          disabled={loadingList}
        >
          <RefreshCw className={`w-3 h-3 ${loadingList ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {listError && (
        <div className="text-sm text-status-down mb-2 flex flex-wrap items-center gap-3">
          {listError}
          <button type="button" onClick={() => void loadScans()} className="text-primary text-xs font-medium hover:underline">
            Retry
          </button>
        </div>
      )}

      {loadingList && !rows.length ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading scans…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No scans yet. Run a scan to see findings here.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 text-left text-muted-foreground">
                <th className="p-3 font-medium">Endpoint</th>
                <th className="p-3 font-medium">Method</th>
                <th className="p-3 font-medium">Risk</th>
                <th className="p-3 font-medium">Issue</th>
                <th className="p-3 font-medium">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rk = String(row.risk_level || "").toLowerCase();
                const badge = riskClass[rk] || riskClass.low;
                const key = row.id || `${row.endpoint}-${row.issue}-${idx}`;
                return (
                  <tr key={key} className="border-t border-border">
                    <td className="p-3 font-mono text-xs max-w-[200px] break-all">{row.endpoint}</td>
                    <td className="p-3 font-mono text-xs">{row.method}</td>
                    <td className="p-3">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-md border ${badge}`}>
                        {row.risk_level}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground max-w-xs">{row.issue}</td>
                    <td className="p-3 text-muted-foreground max-w-md">{row.recommendation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
