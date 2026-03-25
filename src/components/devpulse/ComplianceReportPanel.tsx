import { useCallback, useEffect, useState } from "react";
import { FileText, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, Download, Shield } from "lucide-react";
import { api } from "@/lib/api";

type PCIRequirement = {
  requirement_id: string;
  title: string;
  description: string;
  owasp_category: string;
  status: "PASS" | "FAIL" | "WARN";
  evidence: string;
  findings: Array<{ issue: string; risk_level: string; recommendation: string }>;
  remediation: string;
  gdpr_articles: string[];
};

type ComplianceReport = {
  report_id: string;
  generated_at: string;
  organization: string;
  scan_summary: {
    total_findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  pci_dss: {
    version: string;
    overall_status: "COMPLIANT" | "NON_COMPLIANT" | "PARTIAL_COMPLIANCE";
    overall_message: string;
    compliance_percentage: number;
    requirements_pass: number;
    requirements_fail: number;
    requirements_warn: number;
    requirements: PCIRequirement[];
  };
  gdpr: {
    regulation: string;
    overall_status: "PASS" | "FAIL";
    checks: Array<{
      article: string;
      title: string;
      status: "PASS" | "FAIL";
      evidence: string;
      remediation?: string | null;
    }>;
  };
  attestation: {
    tool: string;
    version: string;
    scan_method: string;
    note: string;
  };
};

type Props = { userId: string };

export default function ComplianceReportPanel({ userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [orgName, setOrgName] = useState("");
  const [expandedReq, setExpandedReq] = useState<string | null>(null);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateComplianceReport(userId, orgName || undefined, "both");
      setReport(res as ComplianceReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate compliance report");
    } finally {
      setLoading(false);
    }
  }, [userId, orgName]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "PASS": return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "FAIL": return <XCircle className="w-4 h-4 text-red-400" />;
      case "WARN": return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default: return null;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "PASS": return "text-green-400 bg-green-400/10 border-green-400/30";
      case "FAIL": return "text-red-400 bg-red-400/10 border-red-400/30";
      case "WARN": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      case "COMPLIANT": return "text-green-400 bg-green-400/10 border-green-400/30";
      case "NON_COMPLIANT": return "text-red-400 bg-red-400/10 border-red-400/30";
      case "PARTIAL_COMPLIANCE": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      default: return "text-muted-foreground bg-muted/20 border-border";
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devpulse-compliance-${report.report_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold font-serif text-foreground">PCI DSS v4.0.1 + GDPR Compliance Report</h2>
        <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
          Patent 4
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Automatically generates compliance evidence from your security scan results.
        PCI DSS v4.0.1 (effective March 2025) and GDPR Article 32 compliance mapping.
      </p>

      {/* Generate Form */}
      {!report && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Organization Name (optional)</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your Company Name"
              className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm outline-none focus:border-primary/30"
            />
          </div>
          <button
            onClick={() => void generateReport()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {loading ? "Generating Report…" : "Generate Compliance Report"}
          </button>
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Report */}
      {report && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Report ID: <span className="font-mono">{report.report_id}</span></p>
              <p className="text-xs text-muted-foreground">Generated: {new Date(report.generated_at).toLocaleString()}</p>
              {report.organization !== "Your Organization" && (
                <p className="text-xs text-muted-foreground">Organization: {report.organization}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadReport}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="w-3 h-3" />
                Download JSON
              </button>
              <button
                onClick={() => { setReport(null); setError(null); }}
                className="text-xs text-primary hover:underline"
              >
                New Report
              </button>
            </div>
          </div>

          {/* Overall Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`rounded-xl border p-4 ${statusBadge(report.pci_dss.overall_status)}`}>
              <div className="flex items-center gap-2 mb-1">
                {statusIcon(report.pci_dss.overall_status === "COMPLIANT" ? "PASS" : report.pci_dss.overall_status === "NON_COMPLIANT" ? "FAIL" : "WARN")}
                <span className="text-sm font-semibold">PCI DSS v{report.pci_dss.version}</span>
              </div>
              <p className="text-xs opacity-80">{report.pci_dss.overall_message}</p>
              <div className="mt-2 flex gap-3 text-xs">
                <span className="text-green-400">✓ {report.pci_dss.requirements_pass} Pass</span>
                <span className="text-red-400">✗ {report.pci_dss.requirements_fail} Fail</span>
                <span className="text-yellow-400">⚠ {report.pci_dss.requirements_warn} Warn</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all"
                  style={{ width: `${report.pci_dss.compliance_percentage}%` }}
                />
              </div>
              <p className="text-xs mt-1 opacity-70">{report.pci_dss.compliance_percentage}% compliant</p>
            </div>

            <div className={`rounded-xl border p-4 ${statusBadge(report.gdpr.overall_status)}`}>
              <div className="flex items-center gap-2 mb-1">
                {statusIcon(report.gdpr.overall_status)}
                <span className="text-sm font-semibold">GDPR (EU 2016/679)</span>
              </div>
              {report.gdpr.checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2 text-xs mt-1">
                  {statusIcon(check.status)}
                  <span className="opacity-80">{check.article}: {check.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PCI DSS Requirements */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">PCI DSS Requirements Detail</h3>
            <div className="space-y-2">
              {report.pci_dss.requirements.map((req) => (
                <div
                  key={req.requirement_id}
                  className={`rounded-xl border overflow-hidden ${req.status === "FAIL" ? "border-red-500/30" : req.status === "WARN" ? "border-yellow-500/30" : "border-green-500/20"}`}
                >
                  <button
                    onClick={() => setExpandedReq(expandedReq === req.requirement_id ? null : req.requirement_id)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/10 transition-colors"
                  >
                    {statusIcon(req.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{req.requirement_id}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${statusBadge(req.status)}`}>{req.status}</span>
                        <span className="text-xs text-muted-foreground">{req.owasp_category}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{req.title}</p>
                    </div>
                  </button>
                  {expandedReq === req.requirement_id && (
                    <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
                      <p className="text-xs text-muted-foreground">{req.description}</p>
                      <div className="p-2 rounded-lg bg-muted/20 text-xs">
                        <span className="font-medium text-foreground">Evidence: </span>
                        <span className="text-muted-foreground">{req.evidence}</span>
                      </div>
                      {req.status !== "PASS" && (
                        <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs">
                          <span className="font-medium text-primary">Remediation: </span>
                          <span className="text-muted-foreground">{req.remediation}</span>
                        </div>
                      )}
                      {req.gdpr_articles.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          GDPR: {req.gdpr_articles.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Attestation */}
          <div className="p-3 rounded-xl bg-muted/20 border border-border text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Attestation</p>
            <p>{report.attestation.note}</p>
            <p className="mt-1">Scan method: {report.attestation.scan_method} | Tool: {report.attestation.tool} v{report.attestation.version}</p>
          </div>
        </div>
      )}
    </div>
  );
}
import { FileText, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, Download, Shield } from "lucide-react";
import { api } from "@/lib/api";

type PCIRequirement = {
  requirement_id: string;
  title: string;
  description: string;
  owasp_category: string;
  status: "PASS" | "FAIL" | "WARN";
  evidence: string;
  findings: Array<{ issue: string; risk_level: string; recommendation: string }>;
  remediation: string;
  gdpr_articles: string[];
};

type ComplianceReport = {
  report_id: string;
  generated_at: string;
  organization: string;
  scan_summary: {
    total_findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  pci_dss: {
    version: string;
    overall_status: "COMPLIANT" | "NON_COMPLIANT" | "PARTIAL_COMPLIANCE";
    overall_message: string;
    compliance_percentage: number;
    requirements_pass: number;
    requirements_fail: number;
    requirements_warn: number;
    requirements: PCIRequirement[];
  };
  gdpr: {
    regulation: string;
    overall_status: "PASS" | "FAIL";
    checks: Array<{
      article: string;
      title: string;
      status: "PASS" | "FAIL";
      evidence: string;
      remediation?: string | null;
    }>;
  };
  attestation: {
    tool: string;
    version: string;
    scan_method: string;
    note: string;
  };
};

type Props = { userId: string };

export default function ComplianceReportPanel({ userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [orgName, setOrgName] = useState("");
  const [expandedReq, setExpandedReq] = useState<string | null>(null);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateComplianceReport(userId, orgName || undefined, "both");
      setReport(res as ComplianceReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate compliance report");
    } finally {
      setLoading(false);
    }
  }, [userId, orgName]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "PASS": return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "FAIL": return <XCircle className="w-4 h-4 text-red-400" />;
      case "WARN": return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default: return null;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "PASS": return "text-green-400 bg-green-400/10 border-green-400/30";
      case "FAIL": return "text-red-400 bg-red-400/10 border-red-400/30";
      case "WARN": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      case "COMPLIANT": return "text-green-400 bg-green-400/10 border-green-400/30";
      case "NON_COMPLIANT": return "text-red-400 bg-red-400/10 border-red-400/30";
      case "PARTIAL_COMPLIANCE": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      default: return "text-muted-foreground bg-muted/20 border-border";
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devpulse-compliance-${report.report_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-card rounded-2xl border border-border p-5 sm:p-6 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold font-serif text-foreground">PCI DSS v4.0.1 + GDPR Compliance Report</h2>
        <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
          Patent 4
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Automatically generates compliance evidence from your security scan results.
        PCI DSS v4.0.1 (effective March 2025) and GDPR Article 32 compliance mapping.
      </p>

      {/* Generate Form */}
      {!report && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Organization Name (optional)</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your Company Name"
              className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm outline-none focus:border-primary/30"
            />
          </div>
          <button
            onClick={() => void generateReport()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {loading ? "Generating Report…" : "Generate Compliance Report"}
          </button>
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Report */}
      {report && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Report ID: <span className="font-mono">{report.report_id}</span></p>
              <p className="text-xs text-muted-foreground">Generated: {new Date(report.generated_at).toLocaleString()}</p>
              {report.organization !== "Your Organization" && (
                <p className="text-xs text-muted-foreground">Organization: {report.organization}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadReport}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="w-3 h-3" />
                Download JSON
              </button>
              <button
                onClick={() => { setReport(null); setError(null); }}
                className="text-xs text-primary hover:underline"
              >
                New Report
              </button>
            </div>
          </div>

          {/* Overall Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`rounded-xl border p-4 ${statusBadge(report.pci_dss.overall_status)}`}>
              <div className="flex items-center gap-2 mb-1">
                {statusIcon(report.pci_dss.overall_status === "COMPLIANT" ? "PASS" : report.pci_dss.overall_status === "NON_COMPLIANT" ? "FAIL" : "WARN")}
                <span className="text-sm font-semibold">PCI DSS v{report.pci_dss.version}</span>
              </div>
              <p className="text-xs opacity-80">{report.pci_dss.overall_message}</p>
              <div className="mt-2 flex gap-3 text-xs">
                <span className="text-green-400">✓ {report.pci_dss.requirements_pass} Pass</span>
                <span className="text-red-400">✗ {report.pci_dss.requirements_fail} Fail</span>
                <span className="text-yellow-400">⚠ {report.pci_dss.requirements_warn} Warn</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all"
                  style={{ width: `${report.pci_dss.compliance_percentage}%` }}
                />
              </div>
              <p className="text-xs mt-1 opacity-70">{report.pci_dss.compliance_percentage}% compliant</p>
            </div>

            <div className={`rounded-xl border p-4 ${statusBadge(report.gdpr.overall_status)}`}>
              <div className="flex items-center gap-2 mb-1">
                {statusIcon(report.gdpr.overall_status)}
                <span className="text-sm font-semibold">GDPR (EU 2016/679)</span>
              </div>
              {report.gdpr.checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2 text-xs mt-1">
                  {statusIcon(check.status)}
                  <span className="opacity-80">{check.article}: {check.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PCI DSS Requirements */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">PCI DSS Requirements Detail</h3>
            <div className="space-y-2">
              {report.pci_dss.requirements.map((req) => (
                <div
                  key={req.requirement_id}
                  className={`rounded-xl border overflow-hidden ${req.status === "FAIL" ? "border-red-500/30" : req.status === "WARN" ? "border-yellow-500/30" : "border-green-500/20"}`}
                >
                  <button
                    onClick={() => setExpandedReq(expandedReq === req.requirement_id ? null : req.requirement_id)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/10 transition-colors"
                  >
                    {statusIcon(req.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{req.requirement_id}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${statusBadge(req.status)}`}>{req.status}</span>
                        <span className="text-xs text-muted-foreground">{req.owasp_category}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{req.title}</p>
                    </div>
                  </button>
                  {expandedReq === req.requirement_id && (
                    <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
                      <p className="text-xs text-muted-foreground">{req.description}</p>
                      <div className="p-2 rounded-lg bg-muted/20 text-xs">
                        <span className="font-medium text-foreground">Evidence: </span>
                        <span className="text-muted-foreground">{req.evidence}</span>
                      </div>
                      {req.status !== "PASS" && (
                        <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs">
                          <span className="font-medium text-primary">Remediation: </span>
                          <span className="text-muted-foreground">{req.remediation}</span>
                        </div>
                      )}
                      {req.gdpr_articles.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          GDPR: {req.gdpr_articles.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Attestation */}
          <div className="p-3 rounded-xl bg-muted/20 border border-border text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Attestation</p>
            <p>{report.attestation.note}</p>
            <p className="mt-1">Scan method: {report.attestation.scan_method} | Tool: {report.attestation.tool} v{report.attestation.version}</p>
          </div>
        </div>
      )}
    </div>
  );
}

