import * as fs from "fs/promises";
import * as path from "path";

/**
 * DevPulse Shadow API Scanner
 * Detects invisible/untracked API endpoints by extracting route definitions
 * from Express, FastAPI, and Django codebases and comparing against known registries.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type Framework = "express" | "fastapi" | "django" | "unknown";

export interface ExtractedRoute {
  method: string;
  path: string;
  file: string;
  line: number;
  framework: Framework;
  handler?: string;
}

export interface KnownEndpoint {
  method: string;
  path: string;
  source: string; // e.g. "openapi-spec", "api-registry", "gateway-config"
}

export interface ShadowApiResult {
  totalRoutes: number;
  knownRoutes: number;
  shadowRoutes: ExtractedRoute[];
  allRoutes: ExtractedRoute[];
  frameworkBreakdown: Record<Framework, number>;
  filesScanned: number;
  duration: number;
  errors: Array<{ file: string; error: string }>;
}

export interface ScanOptions {
  workspaceRoot: string;
  knownEndpoints?: KnownEndpoint[];
  ignorePatterns?: string[];
  maxDepth?: number;
  fileExtensions?: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".vscode",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".env",
  "vendor",
  ".mypy_cache",
  ".pytest_cache",
  "egg-info",
];

const DEFAULT_EXTENSIONS = [".ts", ".js", ".mjs", ".cjs", ".py"];

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "all", "use"];

// ─── Express Route Patterns ──────────────────────────────────────────────────

const EXPRESS_PATTERNS: Array<{ regex: RegExp; extract: (m: RegExpMatchArray) => { method: string; route: string; handler?: string } | null }> = [
  // app.get('/path', handler) / router.post("/path", handler)
  {
    regex: /(?:app|router|server|api)\s*\.\s*(get|post|put|patch|delete|head|options|all|use)\s*\(\s*["'`]([^"'`]+)["'`]/g,
    extract: (m) => ({ method: m[1].toUpperCase(), route: m[2], handler: undefined }),
  },
  // app.route('/path').get(handler).post(handler)
  {
    regex: /(?:app|router|server|api)\s*\.\s*route\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*(get|post|put|patch|delete|head|options)/g,
    extract: (m) => ({ method: m[2].toUpperCase(), route: m[1], handler: undefined }),
  },
  // router.get('/path', ...) with variable prefix like `${prefix}/path`
  {
    regex: /(?:app|router|server|api)\s*\.\s*(get|post|put|patch|delete|head|options|all|use)\s*\(\s*[`$]([^)]+)[)`]/g,
    extract: (m) => {
      const route = m[2].replace(/\$\{[^}]+\}/g, ":param").trim();
      if (route.startsWith('"') || route.startsWith("'")) return null;
      return { method: m[1].toUpperCase(), route: route.startsWith("/") ? route : `/${route}`, handler: undefined };
    },
  },
  // app.use('/path', router) — mount points
  {
    regex: /(?:app|server)\s*\.\s*use\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:router|subRouter|apiRouter|route)/g,
    extract: (m) => ({ method: "MOUNT", route: m[1], handler: undefined }),
  },
];

// ─── FastAPI Route Patterns ──────────────────────────────────────────────────

const FASTAPI_PATTERNS: Array<{ regex: RegExp; extract: (m: RegExpMatchArray) => { method: string; route: string; handler?: string } | null }> = [
  // @app.get("/path") / @router.post("/path")
  {
    regex: /@\s*(?:app|router|api_router|api)\s*\.\s*(get|post|put|patch|delete|head|options|trace)\s*\(\s*["']([^"']+)["']/g,
    extract: (m) => ({ method: m[1].toUpperCase(), route: m[2], handler: undefined }),
  },
  // @app.api_route("/path", methods=["GET", "POST"])
  {
    regex: /@\s*(?:app|router|api_router|api)\s*\.\s*api_route\s*\(\s*["']([^"']+)["']\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/g,
    extract: (m) => {
      const methods = m[2]
        ? m[2].split(",").map((s) => s.trim().replace(/['"]/g, "").toUpperCase())
        : ["*"];
      return { method: methods.join(","), route: m[1], handler: undefined };
    },
  },
  // app.add_api_route("/path", endpoint=handler, methods=["GET"])
  {
    regex: /(?:app|router|api_router|api)\s*\.\s*add_api_route\s*\(\s*["']([^"']+)["']\s*,\s*(?:endpoint\s*=\s*)?(\w+)\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/g,
    extract: (m) => {
      const methods = m[3]
        ? m[3].split(",").map((s) => s.trim().replace(/['"]/g, "").toUpperCase())
        : ["GET"];
      return { method: methods.join(","), route: m[1], handler: m[2] };
    },
  },
  // app.include_router(router, prefix="/api/v1")
  {
    regex: /(?:app|api)\s*\.\s*include_router\s*\(\s*(\w+)\s*(?:,\s*prefix\s*=\s*["']([^"']+)["'])?/g,
    extract: (m) => ({
      method: "MOUNT",
      route: m[2] || "/",
      handler: m[1],
    }),
  },
];

// ─── Django Route Patterns ───────────────────────────────────────────────────

const DJANGO_PATTERNS: Array<{ regex: RegExp; extract: (m: RegExpMatchArray) => { method: string; route: string; handler?: string } | null }> = [
  // path('route/', view_name)
  {
    regex: /path\s*\(\s*["']([^"']+)["']\s*,\s*(\w+)/g,
    extract: (m) => ({ method: "*", route: m[1], handler: m[2] }),
  },
  // url(r'^route/$', view_name) — legacy
  {
    regex: /url\s*\(\s*r?["']([^"']+)["']\s*,\s*(\w+)/g,
    extract: (m) => {
      let route = m[1].replace(/\^/g, "").replace(/\$/g, "").replace(/\\\//g, "/");
      if (!route.startsWith("/")) route = `/${route}`;
      return { method: "*", route, handler: m[2] };
    },
  },
  // re_path(r'^api/(?P<id>\d+)/$', view_name)
  {
    regex: /re_path\s*\(\s*r?["']([^"']+)["']\s*,\s*(\w+)/g,
    extract: (m) => {
      let route = m[1]
        .replace(/\^/g, "")
        .replace(/\$/g, "")
        .replace(/\\\//g, "/")
        .replace(/\(\?P<(\w+)>[^)]+\)/g, ":$1");
      if (!route.startsWith("/")) route = `/${route}`;
      return { method: "*", route, handler: m[2] };
    },
  },
  // urlpatterns = [ path(...), ... ]
  {
    regex: /include\s*\(\s*["']([^"']+)["']/g,
    extract: (m) => ({ method: "INCLUDE", route: m[1].replace(/\.urls$/, ""), handler: undefined }),
  },
  // Django REST Framework: @api_view(['GET', 'POST'])
  {
    regex: /@api_view\s*\(\s*\[([^\]]+)\]\s*\)/g,
    extract: (m) => {
      const methods = m[1].split(",").map((s) => s.trim().replace(/['"]/g, "").toUpperCase());
      return { method: methods.join(","), route: "", handler: undefined };
    },
  },
  // Django REST Framework: class SomeViewSet(viewsets.ModelViewSet)
  {
    regex: /class\s+(\w+)\s*\(\s*(?:viewsets?\.\w+|APIView|GenericAPIView|ViewSet)\s*\)/g,
    extract: (m) => ({ method: "*", route: "", handler: m[1] }),
  },
];

// ─── File Extensions per Framework ───────────────────────────────────────────

const FRAMEWORK_EXTENSIONS: Record<string, Framework> = {
  ".py": "unknown", // needs content-based detection
  ".ts": "unknown",
  ".js": "unknown",
  ".mjs": "unknown",
  ".cjs": "unknown",
};

// ─── Framework Detection ─────────────────────────────────────────────────────

function detectFramework(content: string, filePath: string): Framework {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath);

  if (ext === ".py") {
    // Django indicators
    if (
      /from django/.test(content) ||
      /urlpatterns/.test(content) ||
      /django\.urls/.test(content) ||
      /@api_view/.test(content) ||
      /from rest_framework/.test(content)
    ) {
      return "django";
    }
    // FastAPI indicators
    if (
      /from fastapi/.test(content) ||
      /FastAPI\s*\(/.test(content) ||
      /@app\.(get|post|put|delete|patch)/.test(content) ||
      /@router\.(get|post|put|delete|patch)/.test(content)
    ) {
      return "fastapi";
    }
    return "unknown";
  }

  // JS/TS — Express or Node-based
  if ([".ts", ".js", ".mjs", ".cjs"].includes(ext)) {
    if (
      /require\s*\(\s*["']express["']\)/.test(content) ||
      /from\s+["']express["']/.test(content) ||
      /express\s*\(\s*\)/.test(content) ||
      /\.(get|post|put|delete|patch|use)\s*\(\s*["'`]/.test(content)
    ) {
      return "express";
    }
    return "unknown";
  }

  return "unknown";
}

// ─── Route Extractors ────────────────────────────────────────────────────────

function extractExpressRoutes(content: string, filePath: string, lineOffset: number = 0): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];
  const lines = content.split("\n");

  for (const patternObj of EXPRESS_PATTERNS) {
    // Reset regex lastIndex for each file
    const regex = new RegExp(patternObj.regex.source, patternObj.regex.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const extracted = patternObj.extract(match);
      if (!extracted) continue;

      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNum = beforeMatch.split("\n").length + lineOffset;

      routes.push({
        method: extracted.method,
        path: normalizeRoutePath(extracted.route),
        file: filePath,
        line: lineNum,
        framework: "express",
        handler: extracted.handler,
      });
    }
  }

  return routes;
}

function extractFastApiRoutes(content: string, filePath: string, lineOffset: number = 0): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];

  for (const patternObj of FASTAPI_PATTERNS) {
    const regex = new RegExp(patternObj.regex.source, patternObj.regex.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const extracted = patternObj.extract(match);
      if (!extracted) continue;

      const beforeMatch = content.substring(0, match.index);
      const lineNum = beforeMatch.split("\n").length + lineOffset;

      // Try to find handler name from the next def line
      if (!extracted.handler) {
        const afterMatch = content.substring(match.index + match[0].length);
        const defMatch = afterMatch.match(/def\s+(\w+)/);
        if (defMatch) {
          extracted.handler = defMatch[1];
        }
      }

      routes.push({
        method: extracted.method,
        path: normalizeRoutePath(extracted.route),
        file: filePath,
        line: lineNum,
        framework: "fastapi",
        handler: extracted.handler,
      });
    }
  }

  return routes;
}

function extractDjangoRoutes(content: string, filePath: string, lineOffset: number = 0): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];

  for (const patternObj of DJANGO_PATTERNS) {
    const regex = new RegExp(patternObj.regex.source, patternObj.regex.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const extracted = patternObj.extract(match);
      if (!extracted) continue;

      const beforeMatch = content.substring(0, match.index);
      const lineNum = beforeMatch.split("\n").length + lineOffset;

      routes.push({
        method: extracted.method,
        path: normalizeRoutePath(extracted.route),
        file: filePath,
        line: lineNum,
        framework: "django",
        handler: extracted.handler,
      });
    }
  }

  return routes;
}

// ─── Path Normalization ──────────────────────────────────────────────────────

function normalizeRoutePath(routePath: string): string {
  if (!routePath) return "/";
  let normalized = routePath.trim();

  // Ensure leading slash
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  // Normalize trailing slash (keep root as /)
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  // Normalize Express-style params: :id → {id}
  normalized = normalized.replace(/:(\w+)/g, "{$1}");

  // Normalize Django-style converters: <int:id> → {id}
  normalized = normalized.replace(/<\w+:(\w+)>/g, "{$1}");

  // Normalize wildcard
  normalized = normalized.replace(/\*/g, "{*wildcard}");

  return normalized.toLowerCase();
}

// ─── Comparison Engine ───────────────────────────────────────────────────────

function normalizeMethod(method: string): string[] {
  return method.split(",").map((m) => m.trim().toUpperCase());
}

function routeMatchesKnown(extracted: ExtractedRoute, known: KnownEndpoint): boolean {
  const extractedMethods = normalizeMethod(extracted.method);
  const knownMethods = normalizeMethod(known.method);

  // Method must match (wildcard * matches anything)
  const methodMatch =
    extractedMethods.includes("*") ||
    knownMethods.includes("*") ||
    extractedMethods.some((m) => knownMethods.includes(m));

  if (!methodMatch) return false;

  // Path comparison — normalize both
  const extractedPath = normalizeRoutePath(extracted.path);
  const knownPath = normalizeRoutePath(known.path);

  if (extractedPath === knownPath) return true;

  // Parameter-aware matching: /api/users/{id} matches /api/users/123
  const extractedParts = extractedPath.split("/").filter(Boolean);
  const knownParts = knownPath.split("/").filter(Boolean);

  if (extractedParts.length !== knownParts.length) return false;

  return extractedParts.every((part, i) => {
    if (part.startsWith("{") || knownParts[i].startsWith("{")) return true;
    return part === knownParts[i];
  });
}

function compareWithKnown(extractedRoutes: ExtractedRoute[], knownEndpoints: KnownEndpoint[]): ExtractedRoute[] {
  if (!knownEndpoints || knownEndpoints.length === 0) {
    return extractedRoutes; // all are shadow if no known endpoints
  }

  return extractedRoutes.filter((route) => {
    // Mount/Include points are infrastructure, not direct endpoints
    if (route.method === "MOUNT" || route.method === "INCLUDE") return false;

    return !knownEndpoints.some((known) => routeMatchesKnown(route, known));
  });
}

// ─── Known Endpoint Loaders ──────────────────────────────────────────────────

async function loadKnownEndpoints(workspaceRoot: string): Promise<KnownEndpoint[]> {
  const known: KnownEndpoint[] = [];

  // Try loading from common registry files
  const registryFiles = [
    "api-registry.json",
    "openapi.json",
    "openapi.yaml",
    "openapi.yml",
    "swagger.json",
    "swagger.yaml",
    "swagger.yml",
    "routes.json",
    ".devpulse/known-endpoints.json",
  ];

  for (const file of registryFiles) {
    const filePath = path.join(workspaceRoot, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (file.endsWith(".json")) {
        const parsed = JSON.parse(content);
        const endpoints = extractEndpointsFromSpec(parsed, file);
        known.push(...endpoints);
      }
    } catch {
      // File doesn't exist or isn't valid — skip
    }
  }

  return known;
}

function extractEndpointsFromSpec(spec: Record<string, unknown>, source: string): KnownEndpoint[] {
  const endpoints: KnownEndpoint[] = [];

  // OpenAPI 3.x: spec.paths
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (paths && typeof paths === "object") {
    for (const [routePath, methods] of Object.entries(paths)) {
      if (typeof methods !== "object" || !methods) continue;
      for (const method of Object.keys(methods)) {
        if (HTTP_METHODS.includes(method.toLowerCase()) && method.toLowerCase() !== "use") {
          endpoints.push({ method: method.toUpperCase(), path: routePath, source });
        }
      }
    }
  }

  // Swagger 2.x: spec.paths (same structure)
  // Already handled above

  // Custom registry format: array of { method, path }
  if (Array.isArray(spec)) {
    for (const entry of spec) {
      if (entry && typeof entry === "object" && entry.path) {
        endpoints.push({
          method: (entry.method || entry.verb || "GET").toString().toUpperCase(),
          path: entry.path.toString(),
          source,
        });
      }
    }
  }

  // Custom registry format: { endpoints: [...] }
  const specEndpoints = spec.endpoints as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(specEndpoints)) {
    for (const entry of specEndpoints) {
      if (entry && entry.path) {
        endpoints.push({
          method: (entry.method || entry.verb || "GET").toString().toUpperCase(),
          path: entry.path.toString(),
          source,
        });
      }
    }
  }

  return endpoints;
}

// ─── Main Scanner ────────────────────────────────────────────────────────────

export class ShadowApiScanner {
  private errors: Array<{ file: string; error: string }> = [];

  async scan(options: ScanOptions): Promise<ShadowApiResult> {
    const startTime = Date.now();
    this.errors = [];

    const ignorePatterns = options.ignorePatterns || DEFAULT_IGNORE;
    const maxDepth = options.maxDepth ?? 10;
    const extensions = options.fileExtensions || DEFAULT_EXTENSIONS;

    // Step 1: Discover files
    const files = await this.discoverFiles(options.workspaceRoot, ignorePatterns, maxDepth, extensions);

    // Step 2: Extract routes from all files
    const allRoutes: ExtractedRoute[] = [];
    for (const file of files) {
      try {
        const routes = await this.extractRoutesFromFile(file);
        allRoutes.push(...routes);
      } catch (err) {
        this.errors.push({ file, error: String(err) });
      }
    }

    // Step 3: Deduplicate routes (same method+path+file+line)
    const uniqueRoutes = this.deduplicateRoutes(allRoutes);

    // Step 4: Load known endpoints
    const knownEndpoints = options.knownEndpoints || (await loadKnownEndpoints(options.workspaceRoot));

    // Step 5: Compare — find shadow routes
    const shadowRoutes = compareWithKnown(uniqueRoutes, knownEndpoints);

    // Step 6: Compute framework breakdown
    const frameworkBreakdown: Record<Framework, number> = {
      express: 0,
      fastapi: 0,
      django: 0,
      unknown: 0,
    };
    for (const route of uniqueRoutes) {
      frameworkBreakdown[route.framework]++;
    }

    return {
      totalRoutes: uniqueRoutes.length,
      knownRoutes: uniqueRoutes.length - shadowRoutes.length,
      shadowRoutes,
      allRoutes: uniqueRoutes,
      frameworkBreakdown,
      filesScanned: files.length,
      duration: Date.now() - startTime,
      errors: this.errors,
    };
  }

  private async discoverFiles(
    rootDir: string,
    ignorePatterns: string[],
    maxDepth: number,
    extensions: string[],
    currentDepth: number = 0
  ): Promise<string[]> {
    if (currentDepth > maxDepth) return [];

    const files: string[] = [];

    try {
      const entries = await fs.readdir(rootDir, { withFileTypes: true });

      for (const entry of entries) {
        if (ignorePatterns.some((p) => entry.name.includes(p))) continue;

        const fullPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
          const nested = await this.discoverFiles(fullPath, ignorePatterns, maxDepth, extensions, currentDepth + 1);
          files.push(...nested);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Permission or access error — skip
    }

    return files;
  }

  private async extractRoutesFromFile(filePath: string): Promise<ExtractedRoute[]> {
    const content = await fs.readFile(filePath, "utf-8");
    const framework = detectFramework(content, filePath);

    switch (framework) {
      case "express":
        return extractExpressRoutes(content, filePath);
      case "fastapi":
        return extractFastApiRoutes(content, filePath);
      case "django":
        return extractDjangoRoutes(content, filePath);
      default: {
        // Try all extractors — file might be misdetected
        const all = [
          ...extractExpressRoutes(content, filePath),
          ...extractFastApiRoutes(content, filePath),
          ...extractDjangoRoutes(content, filePath),
        ];
        // Tag them with detected framework if any matched
        if (all.length > 0 && framework === "unknown") {
          // Use the first match's framework
          return all;
        }
        return all;
      }
    }
  }

  private deduplicateRoutes(routes: ExtractedRoute[]): ExtractedRoute[] {
    const seen = new Set<string>();
    return routes.filter((route) => {
      const key = `${route.method}|${route.path}|${route.file}|${route.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate a human-readable report of shadow API findings
   */
  static generateReport(result: ShadowApiResult): string {
    const lines: string[] = [];

    lines.push("# Shadow API Scan Report");
    lines.push("");
    lines.push(`**Scan Duration:** ${result.duration}ms`);
    lines.push(`**Files Scanned:** ${result.filesScanned}`);
    lines.push(`**Total Routes Found:** ${result.totalRoutes}`);
    lines.push(`**Known/Tracked Routes:** ${result.knownRoutes}`);
    lines.push(`**Shadow (Untracked) Routes:** ${result.shadowRoutes.length}`);
    lines.push("");

    lines.push("## Framework Breakdown");
    for (const [fw, count] of Object.entries(result.frameworkBreakdown)) {
      if (count > 0) {
        lines.push(`- **${fw}:** ${count} routes`);
      }
    }
    lines.push("");

    if (result.shadowRoutes.length > 0) {
      lines.push("## Shadow APIs Detected");
      lines.push("");
      lines.push("| Method | Path | File | Line | Framework |");
      lines.push("|--------|------|------|------|-----------|");
      for (const route of result.shadowRoutes) {
        const relPath = route.file.split(/[/\\]/).slice(-3).join("/");
        lines.push(`| ${route.method} | \`${route.path}\` | ${relPath} | ${route.line} | ${route.framework} |`);
      }
      lines.push("");
    }

    if (result.errors.length > 0) {
      lines.push("## Errors");
      for (const err of result.errors) {
        lines.push(`- ${err.file}: ${err.error}`);
      }
    }

    return lines.join("\n");
  }
}
