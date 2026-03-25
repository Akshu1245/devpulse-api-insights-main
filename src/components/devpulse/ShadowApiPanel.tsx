/**
 * Shadow API Discovery Panel — DevPulse Patent 3
 * 
 * Displays shadow API endpoints discovered through IDE static route extraction
 * correlated with local development traffic signatures.
 * 
 * Patent: NHCE/DEV/2026/003
 */
import { useCallback, useEffect, useState } from "react";
import {
  Eye, EyeOff, AlertTriangle, CheckCircle, Loader2,
  RefreshCw, Upload, Shield, Activity, FileCode, Wifi
} from "lucide-react";
import { api } from "@/lib/api";

type ShadowEndpoint = {
  id: string;
  method: string;
  path: string;
  status: string;
  risk_level: string;
  framework: string;
  source_file: string;
  traffic_count: number;
  discovery_method: string;
  discovered_at: string;
  last_seen: string | null;
  resolution?: string;
};

type ShadowStats = {
  user_id: string;
  total_endpoints_discovered: number;
  shadow_endpoints_found: number;
  high_risk_shadow: number;
  medium_risk_shadow: number;
  low_risk_shadow: number;
  projects_scanned: number;
  last_scan: string | null;
  scan_history: Array<{
    scan_id: string;
    project: string;
    shadow_count: number;
    risk_score: number;
    scanned_at: string;
  }>;
};

type InventoryProject = {
  name: string;
  endpoints: ShadowEndpoint[];
  shadow_count: number;
};

type Inventory = {
  user_id: string;
  total_endpoints: number;
  shadow_count: number;
  projects: InventoryProject[];
};

type Props = { userId: string };

const methodColor = (method: string) => {
  switch (method.toUpperCase()) {
    case "GET": return "text-green-400 bg-green-400/10 border-green-400/30";
    case "POST": return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    case "PUT": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
    case "PATCH": return "text-orange-400 bg-orange-400/10 border-orange-400/30";
    case "DELETE": return "text-red-400 bg-red-400/10 border-red-400/30";
    default: return "text-muted-foreground bg-muted/10 border-border";
  }
};

const riskColor = (risk: string) => {
  switch (risk?.toLowerCase()) {
    case "high": return "text-red-400 bg-red-400/10 border-red-400/30";
    case "medium": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
    case "low": return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    default: return "text-muted-foreground bg-muted/10 border-border";
  }
};

const statusIcon = (status: string) => {
  if (status === "shadow_endpoint") return <EyeOff className="w-4 h-4 text-red-400" />;
  if (status === "documented_active") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (status === "dead_route") return <Activity className="w-4 h-4 text-muted-foreground" />;
  if (status?.startsWith("resolved_")) return <CheckCircle className="w-4 h-4 text-blue-400" />;
  return <Eye className="w-4 h-4 text-muted-foreground" />;
};

export default function ShadowApiPanel({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ShadowStats | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [activeTab, setActiveTab] = useState<"shadow" | "all" | "history">("shadow");
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, inventoryRes] = await Promise.all([
        api.getShadowApiStats(userId) as Promise<ShadowStats>,
        api.getShadowApiInventory(userId) as Promise<Inventory>,
      ]);
      setStats(statsRes);
      setInventory(inventoryRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load shadow API data");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (endpointId: string, resolution: string) => {
    setResolving(endpointId);
    try {
      await api.resolveShadowApi(endpointId, userId, resolution);
      await load();
    } catch {
      // ignore
    } finally {
      setResolving(null);
    }
  };

  const allShadowEndpoints = inventory?.projects.flatMap(p =>
    p.endpoints.filter(e => e.status === "shadow_endpoint")
  ) ?? [];

  const allEndpoints = inventory?.projects.flatMap(p => p.endpoints) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading shadow API inventory…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-400 font-medium">{error}</p>
        <button onClick={load} className="mt-3 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Shadow API Discovery
            <span className="text-xs font-normal text-muted-foreground bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
              Patent 3 · NHCE/DEV/2026/003
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            IDE-level static route extraction correlated with local development traffic
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:border-primary/40 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-4 border border-border">
            <div className="text-2xl font-bold text-foreground">{stats.total_endpoints_discovered}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Endpoints</div>
          </div>
          <div className="glass-card rounded-xl p-4 border border-red-400/30 bg-red-400/5">
            <div className="text-2xl font-bold text-red-400">{stats.shadow_endpoints_found}</div>
            <div className="text-xs text-muted-foreground mt-1">Shadow Endpoints</div>
          </div>
          <div className="glass-card rounded-xl p-4 border border-orange-400/30 bg-orange-400/5">
            <div className="text-2xl font-bold text-orange-400">{stats.high_risk_shadow}</div>
            <div className="text-xs text-muted-foreground mt-1">High Risk</div>
          </div>
          <div className="glass-card rounded-xl p-4 border border-border">
            <div className="text-2xl font-bold text-foreground">{stats.projects_scanned}</div>
            <div className="text-xs text-muted-foreground mt-1">Projects Scanned</div>
          </div>
        </div>
      )}

      {/* No data state */}
      {(!stats || stats.total_endpoints_discovered === 0) && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <FileCode className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No API inventory yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Install the DevPulse VS Code extension to automatically extract routes from your source code
            and correlate them with local development traffic to discover shadow APIs.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <FileCode className="w-3.5 h-3.5" />
            <span>Supports FastAPI · Flask · Express · Django · Next.js · Spring</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      {stats && stats.total_endpoints_discovered > 0 && (
        <>
          <div className="flex gap-1 border-b border-border">
            {(["shadow", "all", "history"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "shadow" && `Shadow Endpoints (${allShadowEndpoints.length})`}
                {tab === "all" && `All Endpoints (${allEndpoints.length})`}
                {tab === "history" && `Scan History`}
              </button>
            ))}
          </div>

          {/* Shadow Endpoints Tab */}
          {activeTab === "shadow" && (
            <div className="space-y-3">
              {allShadowEndpoints.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p>No shadow endpoints detected. All traffic matches documented routes.</p>
                </div>
              ) : (
                allShadowEndpoints.map(ep => (
                  <div key={ep.id} className="glass-card rounded-xl border border-red-400/20 bg-red-400/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusIcon(ep.status)}
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${methodColor(ep.method)}`}>
                          {ep.method}
                        </span>
                        <code className="text-sm font-mono text-foreground">{ep.path}</code>
                        <span className={`text-xs px-2 py-0.5 rounded border ${riskColor(ep.risk_level)}`}>
                          {ep.risk_level} risk
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {ep.traffic_count} req{ep.traffic_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Wifi className="w-3 h-3" /> Seen in traffic, not in source
                      </span>
                      {ep.last_seen && (
                        <span>Last seen: {new Date(ep.last_seen).toLocaleDateString()}</span>
                      )}
                    </div>
                    {/* Resolution actions */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Classify as:</span>
                      {["documented", "deprecated", "false_positive", "security_risk"].map(res => (
                        <button
                          key={res}
                          onClick={() => handleResolve(ep.id, res)}
                          disabled={resolving === ep.id}
                          className="text-xs px-2 py-1 rounded border border-border hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
                        >
                          {resolving === ep.id ? <Loader2 className="w-3 h-3 animate-spin" /> : res.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* All Endpoints Tab */}
          {activeTab === "all" && (
            <div className="space-y-2">
              {allEndpoints.map(ep => (
                <div key={ep.id} className="glass-card rounded-lg border border-border p-3 flex items-center gap-3">
                  {statusIcon(ep.status)}
                  <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${methodColor(ep.method)}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm font-mono text-foreground flex-1 truncate">{ep.path}</code>
                  <span className="text-xs text-muted-foreground">{ep.framework}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${
                    ep.status === "shadow_endpoint" ? "text-red-400 border-red-400/30 bg-red-400/5" :
                    ep.status === "documented_active" ? "text-green-400 border-green-400/30 bg-green-400/5" :
                    "text-muted-foreground border-border"
                  }`}>
                    {ep.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Scan History Tab */}
          {activeTab === "history" && stats && (
            <div className="space-y-3">
              {stats.scan_history.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No scan history yet.</p>
              ) : (
                stats.scan_history.map(scan => (
                  <div key={scan.scan_id} className="glass-card rounded-xl border border-border p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{scan.project}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(scan.scanned_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="font-bold text-red-400">{scan.shadow_count}</div>
                        <div className="text-xs text-muted-foreground">Shadow</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-bold ${scan.risk_score > 60 ? "text-red-400" : scan.risk_score > 30 ? "text-yellow-400" : "text-green-400"}`}>
                          {scan.risk_score}
                        </div>
                        <div className="text-xs text-muted-foreground">Risk Score</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Patent badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-4">
        <Shield className="w-3.5 h-3.5 text-primary" />
        <span>
          Patent 3 · NHCE/DEV/2026/003 · Shadow API Discovery via IDE Static-Dynamic Correlation ·
          Zero prior art globally · First IDE-native shadow API tool at &lt;$100/month
        </span>
      </div>
    </div>
  );
}
 * Shadow API Discovery Panel — DevPulse Patent 3
 * 
 * Displays shadow API endpoints discovered through IDE static route extraction
 * correlated with local development traffic signatures.
 * 
 * Patent: NHCE/DEV/2026/003
 */
import { useCallback, useEffect, useState } from "react";
import {
  Eye, EyeOff, AlertTriangle, CheckCircle, Loader2,
  RefreshCw, Upload, Shield, Activity, FileCode, Wifi
} from "lucide-react";
import { api } from "@/lib/api";

type ShadowEndpoint = {
  id: string;
  method: string;
  path: string;
  status: string;
  risk_level: string;
  framework: string;
  source_file: string;
  traffic_count: number;
  discovery_method: string;
  discovered_at: string;
  last_seen: string | null;
  resolution?: string;
};

type ShadowStats = {
  user_id: string;
  total_endpoints_discovered: number;
  shadow_endpoints_found: number;
  high_risk_shadow: number;
  medium_risk_shadow: number;
  low_risk_shadow: number;
  projects_scanned: number;
  last_scan: string | null;
  scan_history: Array<{
    scan_id: string;
    project: string;
    shadow_count: number;
    risk_score: number;
    scanned_at: string;
  }>;
};

type InventoryProject = {
  name: string;
  endpoints: ShadowEndpoint[];
  shadow_count: number;
};

type Inventory = {
  user_id: string;
  total_endpoints: number;
  shadow_count: number;
  projects: InventoryProject[];
};

type Props = { userId: string };

const methodColor = (method: string) => {
  switch (method.toUpperCase()) {
    case "GET": return "text-green-400 bg-green-400/10 border-green-400/30";
    case "POST": return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    case "PUT": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
    case "PATCH": return "text-orange-400 bg-orange-400/10 border-orange-400/30";
    case "DELETE": return "text-red-400 bg-red-400/10 border-red-400/30";
    default: return "text-muted-foreground bg-muted/10 border-border";
  }
};

const riskColor = (risk: string) => {
  switch (risk?.toLowerCase()) {
    case "high": return "text-red-400 bg-red-400/10 border-red-400/30";
    case "medium": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
    case "low": return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    default: return "text-muted-foreground bg-muted/10 border-border";
  }
};

const statusIcon = (status: string) => {
  if (status === "shadow_endpoint") return <EyeOff className="w-4 h-4 text-red-400" />;
  if (status === "documented_active") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (status === "dead_route") return <Activity className="w-4 h-4 text-muted-foreground" />;
  if (status?.startsWith("resolved_")) return <CheckCircle className="w-4 h-4 text-blue-400" />;
  return <Eye className="w-4 h-4 text-muted-foreground" />;
};

export default function ShadowApiPanel({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ShadowStats | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [activeTab, setActiveTab] = useState<"shadow" | "all" | "history">("shadow");
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, inventoryRes] = await Promise.all([
        api.getShadowApiStats(userId) as Promise<ShadowStats>,
        api.getShadowApiInventory(userId) as Promise<Inventory>,
      ]);
      setStats(statsRes);
      setInventory(inventoryRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load shadow API data");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (endpointId: string, resolution: string) => {
    setResolving(endpointId);
    try {
      await api.resolveShadowApi(endpointId, userId, resolution);
      await load();
    } catch {
      // ignore
    } finally {
      setResolving(null);
    }
  };

  const allShadowEndpoints = inventory?.projects.flatMap(p =>
    p.endpoints.filter(e => e.status === "shadow_endpoint")
  ) ?? [];

  const allEndpoints = inventory?.projects.flatMap(p => p.endpoints) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground">Loading shadow API inventory…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-400 font-medium">{error}</p>
        <button onClick={load} className="mt-3 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Shadow API Discovery
            <span className="text-xs font-normal text-muted-foreground bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
              Patent 3 · NHCE/DEV/2026/003
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            IDE-level static route extraction correlated with local development traffic
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:border-primary/40 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-4 border border-border">
            <div className="text-2xl font-bold text-foreground">{stats.total_endpoints_discovered}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Endpoints</div>
          </div>
          <div className="glass-card rounded-xl p-4 border border-red-400/30 bg-red-400/5">
            <div className="text-2xl font-bold text-red-400">{stats.shadow_endpoints_found}</div>
            <div className="text-xs text-muted-foreground mt-1">Shadow Endpoints</div>
          </div>
          <div className="glass-card rounded-xl p-4 border border-orange-400/30 bg-orange-400/5">
            <div className="text-2xl font-bold text-orange-400">{stats.high_risk_shadow}</div>
            <div className="text-xs text-muted-foreground mt-1">High Risk</div>
          </div>
          <div className="glass-card rounded-xl p-4 border border-border">
            <div className="text-2xl font-bold text-foreground">{stats.projects_scanned}</div>
            <div className="text-xs text-muted-foreground mt-1">Projects Scanned</div>
          </div>
        </div>
      )}

      {/* No data state */}
      {(!stats || stats.total_endpoints_discovered === 0) && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <FileCode className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No API inventory yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Install the DevPulse VS Code extension to automatically extract routes from your source code
            and correlate them with local development traffic to discover shadow APIs.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <FileCode className="w-3.5 h-3.5" />
            <span>Supports FastAPI · Flask · Express · Django · Next.js · Spring</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      {stats && stats.total_endpoints_discovered > 0 && (
        <>
          <div className="flex gap-1 border-b border-border">
            {(["shadow", "all", "history"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "shadow" && `Shadow Endpoints (${allShadowEndpoints.length})`}
                {tab === "all" && `All Endpoints (${allEndpoints.length})`}
                {tab === "history" && `Scan History`}
              </button>
            ))}
          </div>

          {/* Shadow Endpoints Tab */}
          {activeTab === "shadow" && (
            <div className="space-y-3">
              {allShadowEndpoints.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p>No shadow endpoints detected. All traffic matches documented routes.</p>
                </div>
              ) : (
                allShadowEndpoints.map(ep => (
                  <div key={ep.id} className="glass-card rounded-xl border border-red-400/20 bg-red-400/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusIcon(ep.status)}
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${methodColor(ep.method)}`}>
                          {ep.method}
                        </span>
                        <code className="text-sm font-mono text-foreground">{ep.path}</code>
                        <span className={`text-xs px-2 py-0.5 rounded border ${riskColor(ep.risk_level)}`}>
                          {ep.risk_level} risk
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {ep.traffic_count} req{ep.traffic_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Wifi className="w-3 h-3" /> Seen in traffic, not in source
                      </span>
                      {ep.last_seen && (
                        <span>Last seen: {new Date(ep.last_seen).toLocaleDateString()}</span>
                      )}
                    </div>
                    {/* Resolution actions */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Classify as:</span>
                      {["documented", "deprecated", "false_positive", "security_risk"].map(res => (
                        <button
                          key={res}
                          onClick={() => handleResolve(ep.id, res)}
                          disabled={resolving === ep.id}
                          className="text-xs px-2 py-1 rounded border border-border hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
                        >
                          {resolving === ep.id ? <Loader2 className="w-3 h-3 animate-spin" /> : res.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* All Endpoints Tab */}
          {activeTab === "all" && (
            <div className="space-y-2">
              {allEndpoints.map(ep => (
                <div key={ep.id} className="glass-card rounded-lg border border-border p-3 flex items-center gap-3">
                  {statusIcon(ep.status)}
                  <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${methodColor(ep.method)}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm font-mono text-foreground flex-1 truncate">{ep.path}</code>
                  <span className="text-xs text-muted-foreground">{ep.framework}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${
                    ep.status === "shadow_endpoint" ? "text-red-400 border-red-400/30 bg-red-400/5" :
                    ep.status === "documented_active" ? "text-green-400 border-green-400/30 bg-green-400/5" :
                    "text-muted-foreground border-border"
                  }`}>
                    {ep.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Scan History Tab */}
          {activeTab === "history" && stats && (
            <div className="space-y-3">
              {stats.scan_history.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No scan history yet.</p>
              ) : (
                stats.scan_history.map(scan => (
                  <div key={scan.scan_id} className="glass-card rounded-xl border border-border p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{scan.project}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(scan.scanned_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="font-bold text-red-400">{scan.shadow_count}</div>
                        <div className="text-xs text-muted-foreground">Shadow</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-bold ${scan.risk_score > 60 ? "text-red-400" : scan.risk_score > 30 ? "text-yellow-400" : "text-green-400"}`}>
                          {scan.risk_score}
                        </div>
                        <div className="text-xs text-muted-foreground">Risk Score</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Patent badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-4">
        <Shield className="w-3.5 h-3.5 text-primary" />
        <span>
          Patent 3 · NHCE/DEV/2026/003 · Shadow API Discovery via IDE Static-Dynamic Correlation ·
          Zero prior art globally · First IDE-native shadow API tool at &lt;$100/month
        </span>
      </div>
    </div>
  );
}

