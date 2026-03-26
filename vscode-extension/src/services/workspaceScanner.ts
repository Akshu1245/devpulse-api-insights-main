import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * DevPulse Workspace Scanner — Shadow API Detection + Secret Scanning
 *
 * Two complementary scan modes:
 *
 * 1. Route-Definition Extraction (Shadow API Discovery — Patent 3)
 *    Extracts API route definitions from source files using framework-specific
 *    regex patterns (Express, FastAPI, Flask, Django, Next.js).
 *    Compares discovered routes against a known-endpoint registry to flag
 *    "shadow" endpoints that are defined in code but not in documentation/inventory.
 *
 * 2. Secret & API-Key Detection
 *    Scans for hardcoded credentials, tokens, and API keys.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RouteDefinition {
  method: string;        // GET | POST | PUT | PATCH | DELETE | …
  path: string;          // Normalized path, e.g. /users/{id}
  rawPath: string;       // As written in source
  framework: string;     // express | fastapi | flask | django | nextjs
  file: string;          // Relative path inside workspace
  line: number;          // 1-based line number
}

export type ShadowStatus =
  | "documented"     // Present in knownEndpoints list
  | "shadow"         // Found in source but NOT in knownEndpoints — SHADOW API
  | "undocumented";  // No known-endpoint registry provided; status unknown

export interface ShadowRoute extends RouteDefinition {
  status: ShadowStatus;
  riskLevel: "high" | "medium" | "low";
  riskReason: string;
}

export interface ScanResult {
  // Route-definition scan
  totalFiles: number;
  routes: ShadowRoute[];
  shadowCount: number;
  documentedCount: number;
  shadowRiskScore: number;   // 0–100

  // Secret scan
  apiUsageCount: number;
  potentialLeaks: number;
  apiEndpoints: Array<{ url: string; count: number; lines: number[] }>;
  keyPatterns: Array<{ pattern: string; count: number; severity: "high" | "medium" | "low" }>;

  // Summary
  insights: Array<{
    title: string;
    description: string;
    severity: "error" | "warning" | "info";
    count: number;
  }>;
  duration: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage",
  ".vscode", ".next", "__pycache__", ".mypy_cache", ".pytest_cache",
  "venv", ".venv", "env", ".env",
]);

const SCANNABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",   // JS/TS
  ".py",                                            // Python
  ".java",                                          // Spring
]);

/** Glob-style patterns for files that contain route definitions per framework */
const ROUTE_FILE_HINTS: Record<string, RegExp> = {
  express:  /\.(js|ts|mjs|cjs)$/i,
  fastapi:  /\.py$/i,
  flask:    /\.py$/i,
  django:   /(urls\.py|views\.py)$/i,
  nextjs:   /(pages[\\/]api|app[\\/]api).*\.(ts|tsx|js|jsx)$/i,
  spring:   /\.(java|kt)$/i,
};

/**
 * Framework-specific regex patterns to extract route definitions.
 * Each pattern must produce:
 *   group 1 — HTTP method OR path (we classify by content)
 *   group 2 — path (if group 1 was method)
 *
 * Patterns are tried IN ORDER; first match per line wins.
 */
const FRAMEWORK_PATTERNS: Record<string, RegExp[]> = {
  // ── Express / Koa / Hapi ──────────────────────────────────────────────────
  express: [
    // router.get('/path', ...) | app.post('/path/:id', ...)
    /(?:app|router|server)\.(get|post|put|patch|delete|head|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    // router.use('/prefix', ...)
    /(?:app|router|server)\.use\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    // Route('/path').get(handler)  — Koa-router style
    /\.route\s*\(\s*['"`]([^'"`]+)['"`]\)/gi,
  ],

  // ── FastAPI ───────────────────────────────────────────────────────────────
  fastapi: [
    // @app.get("/path") | @router.post("/path/{id}")
    /@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi,
    // @app.api_route("/path", methods=["GET","POST"])
    /@(?:app|router)\.api_route\s*\(\s*['"]([^'"]+)['"]/gi,
  ],

  // ── Flask / Quart / Blueprints ────────────────────────────────────────────
  flask: [
    // @app.route("/path", methods=["GET", "POST"])
    /@(?:app|blueprint|bp)\s*\.route\s*\(\s*['"]([^'"]+)['"](?:[^)]*methods\s*=\s*\[([^\]]+)\])?/gi,
    // @app.get("/path")
    /@(?:app|blueprint|bp)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi,
  ],

  // ── Django (urls.py) ──────────────────────────────────────────────────────
  django: [
    // path('endpoint/', view, name='...')
    /\bpath\s*\(\s*['"]([^'"]+)['"]/gi,
    // re_path(r'^endpoint/(?P<pk>\d+)/$', view)
    /\bre_path\s*\(\s*r?['"]([^'"]+)['"]/gi,
    // url(r'^legacy/$', view)  — Django < 4
    /\burl\s*\(\s*r?['"]([^'"]+)['"]/gi,
  ],

  // ── Next.js app/pages router ──────────────────────────────────────────────
  nextjs: [
    // export async function GET(request) { — App Router
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/gi,
    // export default function handler — Pages Router (route inferred from filepath)
    /export\s+default\s+(?:async\s+)?function\s+(?:handler)\s*\(/gi,
  ],

  // ── Spring Boot ───────────────────────────────────────────────────────────
  spring: [
    // @GetMapping("/path") | @RequestMapping(value="/path", method=RequestMethod.POST)
    /@(Get|Post|Put|Patch|Delete|Request)Mapping\s*(?:\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"])?/gi,
  ],
};

const HTTP_METHODS = new Set(["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS","ALL"]);

const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: "high" | "medium" | "low";
}> = [
  { name: "API Key",      pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([^\s'"]{10,})/gi,  severity: "high" },
  { name: "Auth Token",   pattern: /(?:token|authorization|auth[_-]?token)\s*[:=]\s*['"]?([^\s'"]{10,})/gi, severity: "high" },
  { name: "Secret/Pass",  pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})/gi, severity: "high" },
  { name: "AWS Key",      pattern: /AKIA[A-Z0-9]{16}/g, severity: "high" },
  { name: "Private Key",  pattern: /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY/g, severity: "high" },
  { name: "Supabase Key", pattern: /eyJ[A-Za-z0-9+/]{40,}/g, severity: "medium" },
];

const URL_PATTERN = /https?:\/\/(?:api\.)?[\w.-]+(?:\.\w+)+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?/g;

// ── High-risk path keywords for shadow endpoint risk scoring ─────────────────
const HIGH_RISK_KEYWORDS = [
  "admin", "internal", "debug", "test", "dev", "staging",
  "secret", "private", "config", "settings", "env", "hidden",
  "backup", "export", "import", "upload", "download",
  "token", "auth", "login", "password", "key", "credential",
  "healthz", "_internal", "__",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectFramework(filePath: string, content: string): string | null {
  // Next.js: file lives under pages/api/ or app/api/
  if (ROUTE_FILE_HINTS.nextjs.test(filePath)) {
    if (/export\s+(default\s+)?(?:async\s+)?function\s+(handler|GET|POST|PUT|PATCH|DELETE)/i.test(content)) {
      return "nextjs";
    }
  }
  if (/@(?:app|router)\.(get|post|put|patch|delete|api_route)/i.test(content) && filePath.endsWith(".py")) {
    return "fastapi";
  }
  if (/@(?:app|blueprint|bp)\.route/i.test(content) && filePath.endsWith(".py")) {
    return "flask";
  }
  if (/\b(?:path|re_path|url)\s*\(/i.test(content) && /urls\.py$|views\.py$/i.test(filePath)) {
    return "django";
  }
  if (/@(Get|Post|Put|Patch|Delete|Request)Mapping/i.test(content)) {
    return "spring";
  }
  if (/(?:app|router|server)\.(get|post|put|patch|delete|use)\s*\(/i.test(content) &&
      /\.(js|ts|mjs|cjs)$/i.test(filePath)) {
    return "express";
  }
  return null;
}

function normalizePath(raw: string, framework: string): string {
  let p = raw;
  // Flask: <type:name> -> {name}
  p = p.replace(/<(?:[^:>]+:)?([^>]+)>/g, "{$1}");
  // Express: :param -> {param}
  p = p.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
  // Django named groups: (?P<name>...) -> {name}
  p = p.replace(/\(\?P<([^>]+)>[^)]+\)/g, "{$1}");
  // Django anonymous groups
  p = p.replace(/\(\?:[^)]+\)/g, "{}");
  // Django anchors
  p = p.replace(/^\^/, "/").replace(/\$?$/, "");
  // Ensure leading slash
  if (!p.startsWith("/") && !p.startsWith("^") && framework !== "django") p = "/" + p;
  // Remove trailing slash (except root)
  return p.replace(/\/$/, "") || "/";
}

function inferNextJsPath(filePath: string, workspaceRoot: string): string {
  const rel = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
  // pages/api/users/[id].ts -> /users/{id}
  // app/api/users/route.ts  -> /users
  const pagesMatch = rel.match(/pages\/api\/(.+)\.[jt]sx?$/);
  const appMatch   = rel.match(/app\/api\/(.+)\/route\.[jt]sx?$/);
  const base = (pagesMatch?.[1] ?? appMatch?.[1] ?? "unknown")
    .replace(/\[\.{3}(\w+)\]/g, "{$1}")   // [...slug] -> {slug}
    .replace(/\[(\w+)\]/g, "{$1}");       // [id]      -> {id}
  return "/" + base;
}

function assessRisk(p: string, method: string): { level: "high" | "medium" | "low"; reason: string } {
  const lower = p.toLowerCase();
  for (const kw of HIGH_RISK_KEYWORDS) {
    if (lower.includes(kw)) {
      return { level: "high", reason: `Path contains sensitive keyword '${kw}'` };
    }
  }
  if (["POST","PUT","PATCH","DELETE"].includes(method.toUpperCase())) {
    return { level: "medium", reason: `Write operation (${method}) on undocumented endpoint` };
  }
  return { level: "low", reason: "Read-only endpoint with no sensitive keywords" };
}

function calcRiskScore(routes: ShadowRoute[]): number {
  if (!routes.length) return 0;
  const shadows = routes.filter(r => r.status === "shadow");
  let score = 0;
  for (const r of shadows) {
    score += r.riskLevel === "high" ? 30 : r.riskLevel === "medium" ? 15 : 5;
  }
  return Math.min(score, 100);
}

// ── Main scanner class ─────────────────────────────────────────────────────────

export class WorkspaceScanner {
  private output: vscode.OutputChannel;
  private knownEndpoints: Set<string>;   // "METHOD:/path" keys

  constructor(knownEndpoints: string[] = []) {
    this.output = vscode.window.createOutputChannel("DevPulse Workspace Scan");
    // Normalise to uppercase METHOD:/lowercase-path keys
    this.knownEndpoints = new Set(
      knownEndpoints.map(e => e.toUpperCase())
    );
  }

  /** Update the known-endpoint registry without reconstructing the scanner. */
  setKnownEndpoints(endpoints: string[]): void {
    this.knownEndpoints = new Set(endpoints.map(e => e.toUpperCase()));
  }

  async scan(): Promise<ScanResult> {
    const start = Date.now();
    this.output.clear();
    this.output.show(true);

    const result: ScanResult = {
      totalFiles: 0,
      routes: [],
      shadowCount: 0,
      documentedCount: 0,
      shadowRiskScore: 0,
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
        title: "DevPulse: Scanning for shadow APIs...",
        cancellable: true,
      },
      async (progress, token) => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) { this.log("No workspace folder open."); return; }

        for (const folder of folders) {
          this.log(`Scanning: ${folder.uri.fsPath}`);
          await this.scanFolder(folder.uri.fsPath, folder.uri.fsPath, result, progress, token);
        }

        this.processResults(result);
        result.duration = Date.now() - start;
      }
    );

    return result;
  }

  private async scanFolder(
    folderPath: string,
    workspaceRoot: string,
    result: ScanResult,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken,
    depth = 0,
  ): Promise<void> {
    if (depth > 8 || token.isCancellationRequested) return;

    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(folderPath, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (token.isCancellationRequested) return;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(folderPath, entry.name);

      if (entry.isDirectory()) {
        await this.scanFolder(fullPath, workspaceRoot, result, progress, token, depth + 1);
      } else if (entry.isFile() && SCANNABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        await this.scanFile(fullPath, workspaceRoot, result);
        result.totalFiles++;
        progress.report({ message: entry.name });
      }
    }
  }

  private async scanFile(
    filePath: string,
    workspaceRoot: string,
    result: ScanResult,
  ): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch { return; }

    const relPath = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
    const lines = content.split("\n");

    // ── Route definition extraction ───────────────────────────────────────
    const framework = detectFramework(relPath, content);
    if (framework) {
      this.extractRoutes(content, relPath, framework, workspaceRoot, result);
    }

    // ── Secret + URL detection ────────────────────────────────────────────
    const endpointMap = new Map<string, { count: number; lines: number[] }>();

    for (const [idx, line] of lines.entries()) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

      for (const match of line.matchAll(URL_PATTERN)) {
        const url = match[0];
        const entry = endpointMap.get(url) ?? { count: 0, lines: [] };
        entry.count++;
        entry.lines.push(idx + 1);
        endpointMap.set(url, entry);
        result.apiUsageCount++;
      }

      for (const sp of SECRET_PATTERNS) {
        sp.pattern.lastIndex = 0;
        if (sp.pattern.test(line)) {
          const existing = result.keyPatterns.find(k => k.pattern === sp.name);
          if (existing) { existing.count++; }
          else { result.keyPatterns.push({ pattern: sp.name, count: 1, severity: sp.severity }); }
          result.potentialLeaks++;
        }
      }
    }

    for (const [url, data] of endpointMap) {
      result.apiEndpoints.push({ url, count: data.count, lines: data.lines });
    }
  }

  private extractRoutes(
    content: string,
    relPath: string,
    framework: string,
    workspaceRoot: string,
    result: ScanResult,
  ): void {
    const patterns = FRAMEWORK_PATTERNS[framework] ?? [];
    const lines = content.split("\n");

    // For Next.js: derive path from file system position
    const isNextJs = framework === "nextjs";
    const nextPath = isNextJs ? inferNextJsPath(path.join(workspaceRoot, relPath), workspaceRoot) : null;

    for (const pattern of patterns) {
      // Reset stateful regex
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(content)) !== null) {
        const lineNum = content.slice(0, match.index).split("\n").length;
        const groups = match.slice(1).filter(Boolean);

        let method = "GET";
        let rawPath = "";

        if (isNextJs) {
          // method is captured in group 1 (GET|POST|…) or inferred as GET for default export
          if (groups[0] && HTTP_METHODS.has(groups[0].toUpperCase())) {
            method = groups[0].toUpperCase();
          }
          rawPath = nextPath ?? "/";
        } else {
          for (const g of groups) {
            const upper = g.toUpperCase().trim();
            if (HTTP_METHODS.has(upper)) {
              method = upper;
            } else if (g.startsWith("/") || g.includes("{") || g.includes("<") || g.includes(":")) {
              rawPath = g.trim();
            }
          }
          if (!rawPath && groups.length) rawPath = groups[groups.length - 1].trim();
        }

        if (!rawPath) continue;

        const normalPath = normalizePath(rawPath, framework);
        const key = `${method}:${normalPath}`.toUpperCase();

        // Determine shadow status
        let status: ShadowStatus = "undocumented";
        if (this.knownEndpoints.size > 0) {
          status = this.knownEndpoints.has(key) ? "documented" : "shadow";
        }

        const { level: riskLevel, reason: riskReason } = status === "shadow"
          ? assessRisk(normalPath, method)
          : { level: "low" as const, reason: "Documented endpoint" };

        result.routes.push({
          method,
          path: normalPath,
          rawPath,
          framework,
          file: relPath,
          line: lineNum,
          status,
          riskLevel,
          riskReason,
        });
      }
    }
  }

  private processResults(result: ScanResult): void {
    const shadows = result.routes.filter(r => r.status === "shadow");
    const documented = result.routes.filter(r => r.status === "documented");
    const undocumented = result.routes.filter(r => r.status === "undocumented");

    result.shadowCount = shadows.length;
    result.documentedCount = documented.length;
    result.shadowRiskScore = calcRiskScore(result.routes);

    // ── Shadow API insights ─────────────────────────────────────────────────
    if (shadows.length > 0) {
      result.insights.push({
        title: `${shadows.length} Shadow API(s) Detected`,
        description: shadows.map(r => `${r.method} ${r.path} [${r.file}:${r.line}]`).join(", "),
        severity: "error",
        count: shadows.length,
      });

      const highRisk = shadows.filter(r => r.riskLevel === "high");
      if (highRisk.length) {
        result.insights.push({
          title: `${highRisk.length} High-Risk Shadow Endpoint(s)`,
          description: highRisk.map(r => `${r.method} ${r.path} — ${r.riskReason}`).join("; "),
          severity: "error",
          count: highRisk.length,
        });
      }
    }

    if (undocumented.length > 0 && this.knownEndpoints.size === 0) {
      result.insights.push({
        title: `${undocumented.length} Route(s) Found (no registry to compare)`,
        description: "Provide a knownEndpoints list to identify shadow APIs automatically.",
        severity: "info",
        count: undocumented.length,
      });
    }

    if (result.potentialLeaks > 0) {
      result.insights.push({
        title: "Potential Secrets Exposed",
        description: `${result.potentialLeaks} pattern(s) resembling API keys or secrets detected.`,
        severity: "warning",
        count: result.potentialLeaks,
      });
    }

    const topUrls = result.apiEndpoints.sort((a, b) => b.count - a.count).slice(0, 5);
    if (topUrls.length) {
      result.insights.push({
        title: "Most Referenced API URLs",
        description: topUrls.map(a => `${a.url} (${a.count}x)`).join(", "),
        severity: "info",
        count: topUrls.length,
      });
    }

    // ── Console log output ──────────────────────────────────────────────────
    this.log("\n=== DevPulse Shadow API Scan Complete ===");
    this.log(`Files scanned      : ${result.totalFiles}`);
    this.log(`Routes extracted   : ${result.routes.length}`);
    this.log(`  Documented       : ${result.documentedCount}`);
    this.log(`  Shadow (unknown) : ${result.shadowCount}`);
    this.log(`  Undocumented     : ${undocumented.length}`);
    this.log(`Shadow risk score  : ${result.shadowRiskScore}/100`);
    this.log(`Potential leaks    : ${result.potentialLeaks}`);
    this.log(`Scan duration      : ${result.duration}ms`);

    if (shadows.length > 0) {
      this.log("\n[!] SHADOW ENDPOINTS:");
      for (const s of shadows) {
        this.log(`  [${s.riskLevel.toUpperCase()}] ${s.method} ${s.path}`);
        this.log(`      File: ${s.file}:${s.line}  (${s.framework})`);
        this.log(`      Risk: ${s.riskReason}`);
      }
    }

    if (result.potentialLeaks > 0) {
      this.log("\n[!] SECRET PATTERNS:");
      for (const kp of result.keyPatterns) {
        this.log(`  [${kp.severity.toUpperCase()}] ${kp.pattern}: ${kp.count} occurrence(s)`);
      }
    }
  }

  private log(msg: string): void {
    this.output.appendLine(msg);
  }
}
