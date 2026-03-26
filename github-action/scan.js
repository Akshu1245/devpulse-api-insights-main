const { execSync } = require("child_process");
const https = require("https");
const http = require("http");

// ─── Configuration ───────────────────────────────────────────────────────────

const DEVPULSE_API_URL = process.env.INPUT_DEVPULSE_API_URL || "";
const DEVPULSE_API_KEY = process.env.INPUT_DEVPULSE_API_KEY || "";
const GITHUB_TOKEN = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
const FAIL_ON_CRITICAL = (process.env.INPUT_FAIL_ON_CRITICAL || "true") === "true";
const SCAN_SECRETS = (process.env.INPUT_SCAN_SECRETS || "true") === "true";

const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "";
const PR_NUMBER = process.env.GITHUB_EVENT_NUMBER || "";
const GITHUB_SHA = process.env.GITHUB_SHA || "";
const GITHUB_REF = process.env.GITHUB_REF || "";

// ─── Secret Detection Patterns ───────────────────────────────────────────────

const SECRET_PATTERNS = [
  { name: "API Key", pattern: /(?:api[_-]?key|apikey|api[_-]?token)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{16,})["\']?/gi, severity: "critical" },
  { name: "Secret Key", pattern: /(?:secret[_-]?key|secret[_-]?token|client[_-]?secret)\s*[:=]\s*["\']?([A-Za-z0-9_\-]{16,})["\']?/gi, severity: "critical" },
  { name: "Bearer Token", pattern: /(?:bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi, severity: "critical" },
  { name: "Basic Auth", pattern: /(?:authorization)\s*[:=]\s*["\']?(Basic\s+[A-Za-z0-9+/=]+)["\']?/gi, severity: "high" },
  { name: "OpenAI API Key", pattern: /sk-[A-Za-z0-9]{32,}/g, severity: "critical" },
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g, severity: "critical" },
  { name: "GitHub PAT", pattern: /ghp_[A-Za-z0-9]{36}/g, severity: "critical" },
  { name: "GitHub OAuth", pattern: /gho_[A-Za-z0-9]{36}/g, severity: "critical" },
  { name: "GitHub Fine-Grained PAT", pattern: /github_pat_[A-Za-z0-9_]{82}/g, severity: "critical" },
  { name: "Stripe Live Key", pattern: /sk_live_[A-Za-z0-9]{24,}/g, severity: "critical" },
  { name: "Stripe Test Key", pattern: /sk_test_[A-Za-z0-9]{24,}/g, severity: "medium" },
  { name: "Password", pattern: /(?:password|passwd|pwd)\s*[:=]\s*["\']?([^\s"\']{8,})["\']?/gi, severity: "high" },
  { name: "Private Key", pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, severity: "critical" },
  { name: "Database URL", pattern: /(?:database[_-]?url|db[_-]?connection[_-]?string)\s*[:=]\s*["\']?([^\s"\']{20,})["\']?/gi, severity: "critical" },
  { name: "Slack Token", pattern: /xox[bpsar]-[A-Za-z0-9\-]+/g, severity: "critical" },
  { name: "SendGrid Key", pattern: /SG\.[A-Za-z0-9_\-]{22,}\.[A-Za-z0-9_\-]{22,}/g, severity: "critical" },
  { name: "JWT Token", pattern: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_\-+/=]{10,})\b/g, severity: "critical" },
  { name: "Razorpay Key", pattern: /(?:rzp_|razorpay[_-]?key)[A-Za-z0-9_]{16,}/gi, severity: "critical" },
];

const API_ENDPOINT_PATTERN = /https?:\/\/(?:api\.)?[\w.-]+(?:\.\w+)+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?/g;

// ─── Utility Functions ───────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(`[DevPulse] ${msg}\n`);
}

function errorLog(msg) {
  process.stderr.write(`[DevPulse ERROR] ${msg}\n`);
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "DevPulse-GitHub-Action/1.0",
        ...options.headers,
      },
    };

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ─── GitHub API ──────────────────────────────────────────────────────────────

async function getChangedFiles() {
  try {
    const baseRef = process.env.GITHUB_BASE_REF || "main";
    const diffOutput = execSync(`git diff --name-only --diff-filter=ACMR origin/${baseRef}...HEAD`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (!diffOutput) return [];
    return diffOutput.split("\n").filter((f) => f.trim().length > 0);
  } catch (err) {
    log(`git diff failed, trying fetch + diff: ${err.message}`);
    try {
      const baseRef = process.env.GITHUB_BASE_REF || "main";
      execSync(`git fetch origin ${baseRef}`, { stdio: "pipe" });
      const diffOutput = execSync(`git diff --name-only --diff-filter=ACMR FETCH_HEAD...HEAD`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (!diffOutput) return [];
      return diffOutput.split("\n").filter((f) => f.trim().length > 0);
    } catch (innerErr) {
      errorLog(`Failed to get changed files: ${innerErr.message}`);
      return [];
    }
  }
}

function getFileContent(filePath) {
  try {
    return execSync(`git show HEAD:${filePath}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function getDiffContent(filePath) {
  try {
    const baseRef = process.env.GITHUB_BASE_REF || "main";
    return execSync(`git diff origin/${baseRef}...HEAD -- "${filePath}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    try {
      const baseRef = process.env.GITHUB_BASE_REF || "main";
      execSync(`git fetch origin ${baseRef}`, { stdio: "pipe" });
      return execSync(`git diff FETCH_HEAD...HEAD -- "${filePath}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      return "";
    }
  }
}

async function postPRComment(body) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER) {
    log("Missing GitHub token, repo, or PR number — skipping PR comment");
    return;
  }

  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`;

  try {
    const res = await httpRequest(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: { body },
    });

    if (res.status === 201) {
      log("PR comment posted successfully");
    } else {
      errorLog(`Failed to post PR comment: ${res.status} ${JSON.stringify(res.body)}`);
    }
  } catch (err) {
    errorLog(`Failed to post PR comment: ${err.message}`);
  }
}

async function updatePRComment(body, commentId) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) return;

  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/comments/${commentId}`;

  try {
    await httpRequest(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: { body },
    });
    log("PR comment updated successfully");
  } catch (err) {
    errorLog(`Failed to update PR comment: ${err.message}`);
  }
}

async function findExistingComment() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER) return null;

  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100`;

  try {
    const res = await httpRequest(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (res.status === 200 && Array.isArray(res.body)) {
      const marker = "<!-- devpulse-scan -->";
      const existing = res.body.find((c) => c.body && c.body.includes(marker));
      return existing ? existing.id : null;
    }
  } catch (err) {
    errorLog(`Failed to find existing comment: ${err.message}`);
  }
  return null;
}

// ─── DevPulse API Scan ──────────────────────────────────────────────────────

async function scanEndpoint(endpoint) {
  if (!DEVPULSE_API_URL || !DEVPULSE_API_KEY) {
    return { issues: [], skipped: true, reason: "DevPulse API not configured" };
  }

  const scanUrl = `${DEVPULSE_API_URL.replace(/\/$/, "")}/scan`;

  try {
    const res = await httpRequest(scanUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEVPULSE_API_KEY}`,
      },
      body: {
        endpoint: endpoint,
        user_id: "github-action",
      },
    });

    if (res.status === 200 && res.body && res.body.issues) {
      return { issues: res.body.issues, skipped: false };
    }

    return { issues: [], skipped: true, reason: `API returned ${res.status}` };
  } catch (err) {
    return { issues: [], skipped: true, reason: err.message };
  }
}

// ─── Local Secret Detection ──────────────────────────────────────────────────

function detectSecretsInFile(content, filePath) {
  const findings = [];
  const lines = content.split("\n");
  const seen = new Set();

  for (const [lineNum, line] of lines.entries()) {
    if (line.trim().startsWith("//") || line.trim().startsWith("#") || line.trim().startsWith("*")) {
      continue;
    }

    for (const { name, pattern, severity } of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(line)) {
        const key = `${name}:${filePath}:${lineNum}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({
            type: name,
            severity,
            file: filePath,
            line: lineNum + 1,
            detail: `Potential ${name} detected`,
          });
        }
      }
    }
  }

  return findings;
}

function extractEndpointsFromContent(content) {
  const endpoints = new Set();
  const matches = content.matchAll(API_ENDPOINT_PATTERN);
  for (const match of matches) {
    const url = match[0];
    // Filter out common false positives
    if (
      !url.includes("example.com") &&
      !url.includes("localhost") &&
      !url.includes("127.0.0.1") &&
      !url.includes("schema.org") &&
      !url.includes("xmlns") &&
      !url.includes("w3.org") &&
      !url.includes("github.com/repos") // Skip GitHub API calls in action code
    ) {
      endpoints.add(url);
    }
  }
  return [...endpoints];
}

// ─── Report Generation ───────────────────────────────────────────────────────

function generateReport(apiResults, secretFindings, endpoints, files) {
  const criticalIssues = [];
  const highIssues = [];
  const mediumIssues = [];
  const lowIssues = [];

  // Collect API scan issues
  for (const result of apiResults) {
    for (const issue of result.issues) {
      const entry = { ...issue, source: "api-scan", endpoint: result.endpoint };
      if (issue.risk_level === "critical") criticalIssues.push(entry);
      else if (issue.risk_level === "high") highIssues.push(entry);
      else if (issue.risk_level === "medium") mediumIssues.push(entry);
      else lowIssues.push(entry);
    }
  }

  // Collect secret detection findings
  for (const finding of secretFindings) {
    const entry = { ...finding, source: "secret-detection" };
    if (finding.severity === "critical") criticalIssues.push(entry);
    else if (finding.severity === "high") highIssues.push(entry);
    else if (finding.severity === "medium") mediumIssues.push(entry);
    else lowIssues.push(entry);
  }

  const totalIssues = criticalIssues.length + highIssues.length + mediumIssues.length + lowIssues.length;

  // Severity icon
  const icon = (level) => {
    switch (level) {
      case "critical": return "🔴";
      case "high": return "🟠";
      case "medium": return "🟡";
      case "low": return "🟢";
      default: return "⚪";
    }
  };

  // Build markdown report
  let md = "<!-- devpulse-scan -->\n";
  md += "## 🔍 DevPulse API Security Scan\n\n";

  if (totalIssues === 0 && endpoints.length === 0 && secretFindings.length === 0) {
    md += "✅ **No issues found.** No API endpoints or secrets detected in the changed files.\n";
    return { markdown: md, criticalCount: 0, highCount: 0, totalIssues: 0 };
  }

  // Summary badge
  const statusEmoji = criticalIssues.length > 0 ? "🚨" : highIssues.length > 0 ? "⚠️" : "✅";
  md += `${statusEmoji} **Status**: `;
  if (criticalIssues.length > 0) {
    md += `**BUILD FAILED** — ${criticalIssues.length} critical issue(s) found\n`;
  } else if (highIssues.length > 0) {
    md += `**WARNING** — ${highIssues.length} high severity issue(s) found\n`;
  } else {
    md += "**PASSED** — No critical or high severity issues\n";
  }
  md += "\n";

  // Summary table
  md += "| Severity | Count |\n";
  md += "|----------|-------|\n";
  md += `| 🔴 Critical | ${criticalIssues.length} |\n`;
  md += `| 🟠 High | ${highIssues.length} |\n`;
  md += `| 🟡 Medium | ${mediumIssues.length} |\n`;
  md += `| 🟢 Low | ${lowIssues.length} |\n`;
  md += "\n";

  // Files scanned
  md += `**Files scanned**: ${files.length} | **Endpoints tested**: ${endpoints.length} | **Total issues**: ${totalIssues}\n\n`;

  // Critical issues detail
  if (criticalIssues.length > 0) {
    md += "### 🔴 Critical Issues\n\n";
    for (const issue of criticalIssues) {
      if (issue.source === "api-scan") {
        md += `- **${issue.issue}** \`${issue.endpoint}\`\n`;
        md += `  - Method: ${issue.method} | Recommendation: ${issue.recommendation}\n`;
      } else {
        md += `- **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
        md += `  - ${issue.detail}\n`;
      }
    }
    md += "\n";
  }

  // High issues detail
  if (highIssues.length > 0) {
    md += "### 🟠 High Severity Issues\n\n";
    for (const issue of highIssues) {
      if (issue.source === "api-scan") {
        md += `- **${issue.issue}** \`${issue.endpoint}\`\n`;
        md += `  - Method: ${issue.method} | Recommendation: ${issue.recommendation}\n`;
      } else {
        md += `- **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
        md += `  - ${issue.detail}\n`;
      }
    }
    md += "\n";
  }

  // Medium issues
  if (mediumIssues.length > 0) {
    md += `<details>\n<summary>🟡 Medium Severity Issues (${mediumIssues.length})</summary>\n\n`;
    for (const issue of mediumIssues) {
      if (issue.source === "api-scan") {
        md += `- **${issue.issue}** \`${issue.endpoint}\` — ${issue.recommendation}\n`;
      } else {
        md += `- **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
      }
    }
    md += "\n</details>\n\n";
  }

  // Endpoints tested
  if (endpoints.length > 0) {
    md += "<details>\n<summary>🔌 Endpoints Tested</summary>\n\n";
    for (const ep of endpoints) {
      md += `- \`${ep}\`\n`;
    }
    md += "\n</details>\n\n";
  }

  md += "---\n";
  md += `*DevPulse API Security Scan — [Documentation](https://github.com/devpulse)*\n`;

  return {
    markdown: md,
    criticalCount: criticalIssues.length,
    highCount: highIssues.length,
    totalIssues,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log("Starting DevPulse API Security Scan...");
  log(`Repository: ${GITHUB_REPOSITORY}`);
  log(`PR: ${PR_NUMBER}`);
  log(`Fail on critical: ${FAIL_ON_CRITICAL}`);
  log(`Secret scanning: ${SCAN_SECRETS}`);

  // 1. Get changed files
  const changedFiles = await getChangedFiles();
  log(`Found ${changedFiles.length} changed file(s)`);

  // Filter to scannable files
  const scannableExtensions = [
    ".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".java", ".rb", ".php",
    ".json", ".yaml", ".yml", ".toml", ".env", ".config", ".xml",
    ".md", ".html", ".sh", ".bash", ".zsh", ".ps1",
  ];

  const scannableFiles = changedFiles.filter((f) => {
    const ext = f.substring(f.lastIndexOf("."));
    return scannableExtensions.includes(ext) && !f.includes("node_modules/") && !f.includes(".git/");
  });

  log(`Scannable files: ${scannableFiles.length}`);

  // 2. Extract API endpoints from changed files
  const allEndpoints = new Set();
  for (const file of scannableFiles) {
    const content = getFileContent(file);
    if (content) {
      const endpoints = extractEndpointsFromContent(content);
      endpoints.forEach((ep) => allEndpoints.add(ep));
    }
  }

  const endpointList = [...allEndpoints];
  log(`Found ${endpointList.length} API endpoint(s) to scan`);

  // 3. Run API security scan
  const apiResults = [];
  for (const endpoint of endpointList) {
    log(`Scanning endpoint: ${endpoint}`);
    const result = await scanEndpoint(endpoint);
    apiResults.push({ endpoint, ...result });
    if (result.skipped) {
      log(`  Skipped: ${result.reason}`);
    } else {
      log(`  Found ${result.issues.length} issue(s)`);
    }
  }

  // 4. Run local secret detection
  const secretFindings = [];
  if (SCAN_SECRETS) {
    log("Running secret detection on changed files...");
    for (const file of scannableFiles) {
      const content = getFileContent(file);
      if (content) {
        const findings = detectSecretsInFile(content, file);
        secretFindings.push(...findings);
      }
    }
    log(`Secret detection found ${secretFindings.length} finding(s)`);
  }

  // 5. Generate report
  const report = generateReport(apiResults, secretFindings, endpointList, scannableFiles);

  // 6. Output results
  log(`\n${"=".repeat(60)}`);
  log(`SCAN RESULTS`);
  log(`${"=".repeat(60)}`);
  log(`Critical: ${report.criticalCount}`);
  log(`High: ${report.highCount}`);
  log(`Total issues: ${report.totalIssues}`);
  log(`${"=".repeat(60)}\n`);

  // Set GitHub Action outputs
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const fs = require("fs");
    fs.appendFileSync(outputFile, `result=${JSON.stringify({ critical: report.criticalCount, high: report.highCount, total: report.totalIssues })}\n`);
    fs.appendFileSync(outputFile, `critical-count=${report.criticalCount}\n`);
    fs.appendFileSync(outputFile, `high-count=${report.highCount}\n`);
  }

  // 7. Post or update PR comment
  if (GITHUB_TOKEN && PR_NUMBER) {
    const existingCommentId = await findExistingComment();
    if (existingCommentId) {
      await updatePRComment(report.markdown, existingCommentId);
    } else {
      await postPRComment(report.markdown);
    }
  }

  // 8. Fail on critical issues
  if (FAIL_ON_CRITICAL && report.criticalCount > 0) {
    errorLog(`Build failed: ${report.criticalCount} critical issue(s) found`);
    process.exit(1);
  }

  log("Scan completed successfully");
}

main().catch((err) => {
  errorLog(`Fatal error: ${err.message}`);
  process.exit(2);
});
