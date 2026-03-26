import * as vscode from "vscode";
import * as https from "https";
import * as http from "http";

export interface ScanIssue {
  issue: string;
  risk_level: "critical" | "high" | "medium" | "low";
  recommendation: string;
  method: string;
}

export interface ScanResponse {
  issues: ScanIssue[];
  endpoint: string;
}

export interface Alert {
  id: string;
  user_id: string;
  severity: string;
  description: string;
  endpoint: string;
  resolved: boolean;
  created_at: string;
}

export interface ScanRecord {
  id: string;
  user_id: string;
  endpoint: string;
  method: string;
  risk_level: string;
  issue: string;
  recommendation: string;
  scanned_at: string;
}

export interface HealthCheck {
  status: string;
  service: string;
  patents: number;
}

export class ApiClient {
  private baseUrl: string;
  private userId: string;
  private output: vscode.OutputChannel;

  constructor() {
    this.output = vscode.window.createOutputChannel("DevPulse API");
    const config = vscode.workspace.getConfiguration("devpulse");
    this.baseUrl = config.get<string>("backendUrl", "http://localhost:8000");
    this.userId = config.get<string>("userId", "vscode-user");

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("devpulse.backendUrl")) {
        this.baseUrl = vscode.workspace
          .getConfiguration("devpulse")
          .get<string>("backendUrl", "http://localhost:8000");
      }
      if (e.affectsConfiguration("devpulse.userId")) {
        this.userId = vscode.workspace
          .getConfiguration("devpulse")
          .get<string>("userId", "vscode-user");
      }
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : undefined;

    return new Promise<T>((resolve, reject) => {
      const req = transport.request(
        url,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            "x-user-id": this.userId,
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(raw) as T);
              } catch {
                reject(new Error(`Invalid JSON response: ${raw.slice(0, 200)}`));
              }
            } else {
              reject(
                new Error(
                  `HTTP ${res.statusCode}: ${raw.slice(0, 300)}`
                )
              );
            }
          });
        }
      );

      req.on("error", (err) => reject(err));
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  async healthCheck(): Promise<HealthCheck> {
    return this.request<HealthCheck>("GET", "/health");
  }

  async scanEndpoint(endpoint: string): Promise<ScanResponse> {
    this.output.appendLine(`[scan] Scanning ${endpoint}...`);
    const result = await this.request<ScanResponse>("POST", "/scan", {
      endpoint,
      user_id: this.userId,
    });
    this.output.appendLine(
      `[scan] Found ${result.issues.length} issues for ${endpoint}`
    );
    return result;
  }

  async getAlerts(): Promise<{ alerts: Alert[] }> {
    return this.request<{ alerts: Alert[] }>(
      "GET",
      `/alerts/${encodeURIComponent(this.userId)}`
    );
  }

  async resolveAlert(alertId: string): Promise<Alert> {
    return this.request<Alert>(
      "PATCH",
      `/alerts/${encodeURIComponent(alertId)}/resolve`,
      { user_id: this.userId }
    );
  }

  async getScans(): Promise<{ scans: ScanRecord[] }> {
    return this.request<{ scans: ScanRecord[] }>(
      "GET",
      `/scans/${encodeURIComponent(this.userId)}`
    );
  }

  async scanCode(code: string, languageId: string): Promise<ScanIssue[]> {
    this.output.appendLine(
      `[scan] Analyzing ${languageId} code (${code.length} chars)...`
    );
    const issues: ScanIssue[] = [];

    const secretPatterns = [
      {
        regex:
          /(?:api[_-]?key|apikey)\s*[:=]\s*["\']?([^\s"\']{10,})/gi,
        issue: "Hardcoded API key detected",
        risk_level: "critical" as const,
        recommendation:
          "Move API keys to environment variables or a secrets manager.",
      },
      {
        regex:
          /(?:secret|password|passwd|pwd)\s*[:=]\s*["\']?([^\s"\']{8,})/gi,
        issue: "Hardcoded secret or password detected",
        risk_level: "critical" as const,
        recommendation:
          "Never hardcode secrets. Use environment variables or vault services.",
      },
      {
        regex: /(?:token|authorization|auth[_-]?token)\s*[:=]\s*["\']?([^\s"\']{10,})/gi,
        issue: "Hardcoded authentication token detected",
        risk_level: "critical" as const,
        recommendation:
          "Store tokens securely using environment variables.",
      },
      {
        regex: /AKIA[A-Z0-9]{16}/g,
        issue: "AWS Access Key detected",
        risk_level: "critical" as const,
        recommendation:
          "Remove AWS keys from code. Use IAM roles or environment variables.",
      },
      {
        regex: /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY/g,
        issue: "Private key detected in code",
        risk_level: "critical" as const,
        recommendation:
          "Move private keys to secure storage, never commit them.",
      },
    ];

    const httpPattern = /http:\/\/(?!localhost)[^\s"']+/g;
    const lines = code.split("\n");

    for (const pat of secretPatterns) {
      pat.regex.lastIndex = 0;
      let match;
      while ((match = pat.regex.exec(code)) !== null) {
        issues.push({
          issue: pat.issue,
          risk_level: pat.risk_level,
          recommendation: pat.recommendation,
          method: "static-analysis",
        });
      }
    }

    for (const line of lines) {
      let match;
      httpPattern.lastIndex = 0;
      while ((match = httpPattern.exec(line)) !== null) {
        if (!match[0].includes("localhost")) {
          issues.push({
            issue: `Insecure HTTP URL: ${match[0]}`,
            risk_level: "high",
            recommendation:
              "Use HTTPS instead of HTTP for external API calls.",
            method: "static-analysis",
          });
        }
      }
    }

    this.output.appendLine(
      `[scan] Static analysis found ${issues.length} issues`
    );
    return issues;
  }

  isReachable(): Promise<boolean> {
    return this.healthCheck()
      .then(() => true)
      .catch(() => false);
  }
}
