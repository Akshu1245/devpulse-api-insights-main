import { useState, useRef, useCallback } from "react";
import { Upload, AlertTriangle, CheckCircle, Key, Shield, Loader2, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { api } from "@/lib/api";

type CredentialFinding = {
  type: string;
  location: string;
  severity: string;
  detail: string;
  recommendation: string;
};

type ImportResult = {
  success: boolean;
  collection_name: string;
  total_endpoints: number;
  scannable_urls_count: number;
  credentials_exposed_count: number;
  endpoints_with_credentials: number;
  credential_findings: CredentialFinding[];
  scan_results: Array<{
    endpoint: string;
    issue: string;
    risk_level: string;
    recommendation: string;
    method?: string;
  }>;
  alert?: string;
  summary: {
    critical_findings: number;
    high_findings: number;
    total_scannable: number;
  };
};

type Props = { userId: string };

export default function PostmanImporter({ userId }: Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".json")) {
      setError("Please upload a Postman Collection JSON file (.json)");
      return;
    }

    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const text = await file.text();
      const collection = JSON.parse(text);

      const res = await api.importPostmanCollection(userId, collection, true);
      setResult(res as ImportResult);
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError("Invalid JSON file. Please upload a valid Postman Collection export.");
      } else {
        setError(e instanceof Error ? e.message : "Import failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }, [processFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = "";
  }, [processFile]);

  const severityColor = (s: string) => {
    switch (s?.toLowerCase()) {
      case "critical": return "text-red-400 bg-red-400/10 border-red-400/30";
      case "high": return "text-orange-400 bg-orange-400/10 border-orange-400/30";
      case "medium": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      default: return "text-muted-foreground bg-muted/20 border-border";
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <Upload className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold font-serif text-foreground">Postman Collection Import</h2>
        <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
          Postman Refugee Engine
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Import your Postman Collection to instantly detect exposed API keys, credentials, and security vulnerabilities.
        Supports Postman Collection v2.0 and v2.1 JSON format.
      </p>

      {/* Drop Zone */}
      {!result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"}
          `}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={onFileChange}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Scanning collection for credentials and vulnerabilities…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Drop your Postman Collection JSON here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse — Export from Postman: Collection → ⋯ → Export</p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-4">
          {/* Shocking Insight — shown immediately, always first */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            result.credentials_exposed_count > 0 || result.summary.critical_findings > 0
              ? "bg-red-500/10 border-red-500/30"
              : result.summary.high_findings > 0
              ? "bg-orange-500/10 border-orange-500/30"
              : "bg-green-500/10 border-green-500/20"
          }`}>
            <Zap className={`w-5 h-5 shrink-0 mt-0.5 ${
              result.credentials_exposed_count > 0 || result.summary.critical_findings > 0
                ? "text-red-400"
                : result.summary.high_findings > 0
                ? "text-orange-400"
                : "text-green-400"
            }`} />
            <div>
              <p className={`text-sm font-bold ${
                result.credentials_exposed_count > 0 || result.summary.critical_findings > 0
                  ? "text-red-400"
                  : result.summary.high_findings > 0
                  ? "text-orange-400"
                  : "text-green-400"
              }`}>
                {result.credentials_exposed_count > 0
                  ? `⚡ ${result.total_endpoints} endpoints scanned — ${result.credentials_exposed_count} LIVE credentials exposed. Rotate them NOW.`
                  : result.summary.critical_findings > 0
                  ? `⚡ ${result.summary.critical_findings} CRITICAL security issue${result.summary.critical_findings > 1 ? "s" : ""} found across ${result.total_endpoints} endpoints.`
                  : result.summary.high_findings > 0
                  ? `⚡ ${result.summary.high_findings} HIGH severity issue${result.summary.high_findings > 1 ? "s" : ""} found in your collection.`
                  : `✅ ${result.total_endpoints} endpoints scanned. No critical issues found.`
                }
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Collection: <span className="font-medium text-foreground">{result.collection_name}</span>
                {" · "}
                {result.scan_results.length} security checks · {result.scannable_urls_count} URLs probed
              </p>
            </div>
          </div>

          {/* Critical Alert Banner */}
          {result.credentials_exposed_count > 0 && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400">
                  🚨 {result.credentials_exposed_count} Exposed Credential{result.credentials_exposed_count > 1 ? "s" : ""} Found!
                </p>
                <p className="text-xs text-red-300/80 mt-1">
                  These credentials may have been visible in public Postman workspaces. Rotate them immediately.
                </p>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted/20 border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.total_endpoints}</p>
              <p className="text-xs text-muted-foreground mt-1">Endpoints Found</p>
            </div>
            <div className={`rounded-xl border p-3 text-center ${result.credentials_exposed_count > 0 ? "bg-red-500/10 border-red-500/30" : "bg-green-500/10 border-green-500/30"}`}>
              <p className={`text-2xl font-bold ${result.credentials_exposed_count > 0 ? "text-red-400" : "text-green-400"}`}>
                {result.credentials_exposed_count}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Credentials Exposed</p>
            </div>
            <div className="rounded-xl bg-muted/20 border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.scan_results.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Security Issues</p>
            </div>
            <div className="rounded-xl bg-muted/20 border border-border p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.scannable_urls_count}</p>
              <p className="text-xs text-muted-foreground mt-1">URLs Scanned</p>
            </div>
          </div>

          {/* Collection Name */}
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-muted-foreground">Collection:</span>
            <span className="font-medium text-foreground">{result.collection_name}</span>
          </div>

          {/* Credential Findings */}
          {result.credential_findings.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-foreground">Credential Findings</h3>
              </div>
              <div className="space-y-2">
                {(showAllFindings ? result.credential_findings : result.credential_findings.slice(0, 3)).map((f, i) => (
                  <div key={i} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-md border mr-2 ${severityColor(f.severity)}`}>
                          {f.severity.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-foreground">{f.type}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{f.detail}</p>
                    <p className="text-xs text-red-300/80 mt-1 font-medium">{f.recommendation}</p>
                  </div>
                ))}
                {result.credential_findings.length > 3 && (
                  <button
                    onClick={() => setShowAllFindings(!showAllFindings)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {showAllFindings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showAllFindings ? "Show less" : `Show ${result.credential_findings.length - 3} more findings`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Security Scan Results */}
          {result.scan_results.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Security Scan Results</h3>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/20 text-left text-muted-foreground">
                      <th className="p-2 font-medium">Endpoint</th>
                      <th className="p-2 font-medium">Risk</th>
                      <th className="p-2 font-medium">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.scan_results.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 font-mono max-w-[180px] truncate">{r.endpoint}</td>
                        <td className="p-2">
                          <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded border ${severityColor(r.risk_level)}`}>
                            {r.risk_level}
                          </span>
                        </td>
                        <td className="p-2 text-muted-foreground max-w-xs truncate">{r.issue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No issues found */}
          {result.credentials_exposed_count === 0 && result.scan_results.length === 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">No credentials or security issues found</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your collection looks clean. Continue scanning regularly.</p>
              </div>
            </div>
          )}

          {/* Import Another */}
          <button
            onClick={() => { setResult(null); setError(null); }}
            className="text-xs text-primary hover:underline"
          >
            Import another collection
          </button>
        </div>
      )}
    </div>
  );
}
