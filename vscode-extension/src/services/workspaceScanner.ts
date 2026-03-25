import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * DevPulse Workspace Scanner
 * Analyzes all files in workspace for API usage patterns, leaks, and insights
 */

export interface ScanResult {
  totalFiles: number;
  apiUsageCount: number;
  potentialLeaks: number;
  apiEndpoints: Array<{ url: string; count: number; lines: number[] }>;
  keyPatterns: Array<{ pattern: string; count: number; severity: "high" | "medium" | "low" }>;
  insights: Array<{ title: string; description: string; severity: "error" | "warning" | "info"; count: number }>;
  duration: number;
}

const IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".vscode",
  ".next",
  "__pycache__",
  ".env.example",
  "yarn.lock",
  "package-lock.json",
];

const API_ENDPOINT_PATTERN = /https?:\/\/(?:api\.)?[\w.-]+(?:\.\w+)+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?/g;
const API_KEY_PATTERNS = [
  { name: "API Key Pattern", pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["\']?([^\s"\']{10,})/gi, severity: "high" as const },
  {
    name: "Token Pattern",
    pattern: /(?:token|authorization|auth[_-]?token)\s*[:=]\s*["\']?([^\s"\']{10,})/gi,
    severity: "high" as const,
  },
  {
    name: "Secret Pattern",
    pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*["\']?([^\s"\']{8,})/gi,
    severity: "high" as const,
  },
  { name: "AWS Key", pattern: /AKIA[A-Z0-9]{16}/g, severity: "high" as const },
  { name: "Private Key", pattern: /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY/g, severity: "high" as const },
];

export class WorkspaceScanner {
  private output: vscode.OutputChannel;
  private progress: vscode.Progress<{ message?: string; increment?: number }> | null = null;

  constructor() {
    this.output = vscode.window.createOutputChannel("DevPulse Workspace Scan");
  }

  async scan(): Promise<ScanResult> {
    const startTime = Date.now();
    this.output.clear();
    this.output.show(true);

    const result: ScanResult = {
      totalFiles: 0,
      apiUsageCount: 0,
      potentialLeaks: 0,
      apiEndpoints: [],
      keyPatterns: [],
      insights: [],
      duration: 0,
    };

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DevPulse: Scanning workspace...",
        cancellable: true,
      },
      async (progress) => {
        this.progress = progress;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          this.log("No workspace folder found");
          return;
        }

        for (const folder of workspaceFolders) {
          this.log(`Scanning folder: ${folder.name}`);
          await this.scanFolder(folder.uri.fsPath, result);
        }

        // Process results
        this.processResults(result);
        result.duration = Date.now() - startTime;
      }
    );

    return result;
  }

  private async scanFolder(folderPath: string, result: ScanResult, depth = 0): Promise<void> {
    if (depth > 5) return; // Limit recursion depth

    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip ignored patterns
        if (IGNORE_PATTERNS.some((p) => entry.name.includes(p))) {
          continue;
        }

        const fullPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          await this.scanFolder(fullPath, result, depth + 1);
        } else if (entry.isFile()) {
          await this.scanFile(fullPath, result);
          result.totalFiles++;

          if (this.progress) {
            this.progress.report({ message: `Scanned: ${entry.name}` });
          }
        }
      }
    } catch (e) {
      // Ignore file system errors
    }
  }

  private async scanFile(filePath: string, result: ScanResult): Promise<void> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const endpointMap = new Map<string, { count: number; lines: number[] }>();

      for (const [lineNum, line] of lines.entries()) {
        // Skip comments and empty lines
        if (line.trim().startsWith("//") || line.trim().startsWith("#") || line.trim().length === 0) {
          continue;
        }

        // Scan for API endpoints
        const endpoints = line.matchAll(API_ENDPOINT_PATTERN);
        for (const match of endpoints) {
          const url = match[0];
          const current = endpointMap.get(url) || { count: 0, lines: [] };
          current.count++;
          current.lines.push(lineNum + 1);
          endpointMap.set(url, current);
          result.apiUsageCount++;
        }

        // Scan for key patterns
        for (const keyPattern of API_KEY_PATTERNS) {
          if (keyPattern.pattern.test(line)) {
            const existing = result.keyPatterns.find((k) => k.pattern === keyPattern.name);
            if (existing) {
              existing.count++;
            } else {
              result.keyPatterns.push({
                pattern: keyPattern.name,
                count: 1,
                severity: keyPattern.severity,
              });
            }
            result.potentialLeaks++;
          }
        }
      }

      // Add endpoints to result
      for (const [url, data] of endpointMap) {
        result.apiEndpoints.push({ url, count: data.count, lines: data.lines });
      }
    } catch (e) {
      // Ignore read errors (binary files, permissions, etc.)
    }
  }

  private processResults(result: ScanResult): void {
    // Generate insights
    if (result.apiUsageCount > 50) {
      result.insights.push({
        title: "High API usage detected",
        description: `Found ${result.apiUsageCount} API references across workspace`,
        severity: "info",
        count: result.apiUsageCount,
      });
    }

    if (result.potentialLeaks > 0) {
      result.insights.push({
        title: "Potential secrets exposed",
        description: `Found ${result.potentialLeaks} patterns that look like API keys or secrets`,
        severity: "warning",
        count: result.potentialLeaks,
      });
    }

    // Top APIs
    const topApis = result.apiEndpoints.sort((a, b) => b.count - a.count).slice(0, 5);
    if (topApis.length > 0) {
      result.insights.push({
        title: "Most used APIs",
        description: topApis.map((a) => `${a.url} (${a.count}x)`).join(", "),
        severity: "info",
        count: topApis.length,
      });
    }

    // Log results
    this.log(`\n📊 Scan Complete`);
    this.log(`Files scanned: ${result.totalFiles}`);
    this.log(`API usages found: ${result.apiUsageCount}`);
    this.log(`Potential leaks: ${result.potentialLeaks}`);
    this.log(`Duration: ${result.duration}ms`);
    this.log(`\n🔌 Top APIs:`);
    topApis.forEach((api) => {
      this.log(`  • ${api.url} (${api.count} occurrences)`);
    });

    if (result.potentialLeaks > 0) {
      this.log(`\n⚠️ Potential Secrets Found:`);
      result.keyPatterns.forEach((kp) => {
        this.log(`  • ${kp.pattern}: ${kp.count} occurrences`);
      });
    }
  }

  private log(message: string): void {
    this.output.appendLine(message);
  }
}
