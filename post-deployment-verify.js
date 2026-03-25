#!/usr/bin/env node

/**
 * Post-Deployment Verification Script
 * Run this after deploying to verify everything works correctly
 * 
 * Usage: node post-deployment-verify.js
 * Requirements: .env.local with live credentials
 */

import https from "https";
import { URL } from "url";
import fs from "fs";

const log = (...args) => {
  process.stdout.write(args.join(' ') + '\n');
};

const results = [];

// Load environment
const loadEnv = () => {
  if (!fs.existsSync(".env.local")) {
    throw new Error(".env.local not found");
  }

  const lines = fs.readFileSync(".env.local", "utf-8").split("\n");
  const env = {};
  lines.forEach((line) => {
    const [key, ...value] = line.split("=");
    if (key && value) env[key.trim()] = value.join("=").trim();
  });
  return env;
};

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const fetchSupabase = async (endpoint, options = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const urlString = url.toString();
    const authKey = options.key || ANON_KEY;

    const opts = {
      method: options.method || "GET",
      headers: {
        "Authorization": `Bearer ${authKey}`,
        "apikey": authKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    const req = https.request(urlString, opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            data: parsed,
            headers: res.headers,
          });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
};

const test = async (name, fn) => {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration_ms: duration });
    log(`  ✅ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    results.push({
      name,
      passed: false,
      duration_ms: duration,
      error: error.message,
    });
    log(
      `  ❌ ${name} (${duration}ms): ${error.message}`
    );
  }
};

const main = async () => {
  log("\n🔍 Post-Deployment Verification\n");

  log("Step 1: Database Connectivity");
  log("────────────────────────────\n");

  await test("Database connection", async () => {
    const res = await fetchSupabase("/rest/v1/profiles", {
      method: "GET",
      headers: { Prefer: "count=exact" },
      key: SERVICE_ROLE_KEY,
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  });

  await test("Profiles table exists", async () => {
    const res = await fetchSupabase(`/rest/v1/profiles?select=id&limit=1`, {
      key: SERVICE_ROLE_KEY,
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  });

  await test("API keys table exists", async () => {
    const res = await fetchSupabase(`/rest/v1/user_api_keys?select=id&limit=1`, {
      key: SERVICE_ROLE_KEY,
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  });

  await test("Audit log table exists", async () => {
    const res = await fetchSupabase(`/rest/v1/audit_log?select=id&limit=1`, {
      key: SERVICE_ROLE_KEY,
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  });

  log("\nStep 2: Edge Function Deployment");
  log("────────────────────────────────\n");

  const functions = [
    "user-api-keys",
    "api-proxy",
    "health-check",
    "check-subscription",
    "cost-forecast-ai",
    "create-checkout",
    "customer-portal",
    "leak-scanner",
    "loop-detection",
    "rate-limiter",
    "send-email-alert",
    "send-webhook",
  ];

  for (const fn of functions) {
    await test(`Function deployed: ${fn}`, async () => {
      const res = await fetchSupabase(`/functions/v1/${fn}`, {
        method: "POST",
        body: { test: true },
      });
      if (res.status === 404) throw new Error("Function not found");
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    });
  }

  log("\nStep 3: Security Verification");
  log("──────────────────────────────\n");

  await test("Authentication enforced", async () => {
    const res = await fetchSupabase("/rest/v1/profiles", {
      key: "invalid-key",
    });
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`Expected 401/403, got ${res.status}`);
    }
  });

  await test("CORS headers present", async () => {
    const res = await fetchSupabase("/rest/v1/profiles", {
      headers: { Origin: "http://localhost:3000" },
    });
    if (!res.headers["access-control-allow-origin"]) {
      throw new Error("CORS header missing");
    }
  });

  log("\nStep 4: Health Check");
  log("───────────────────\n");

  await test("Health check endpoint", async () => {
    const res = await fetchSupabase("/functions/v1/health-check", {
      method: "GET",
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    if (!res.data.status) throw new Error("No status in response");
  });

  log("\n" + "=".repeat(50));
  log("Summary");
  log("=".repeat(50) + "\n");

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const elapsed = results.reduce((sum, r) => sum + r.duration_ms, 0);

  log(`Tests Passed: ${passed}/${total}`);
  log(`Total Time: ${elapsed}ms\n`);

  if (passed === total) {
    log("✅ All tests passed! Deployment verified.\n");
    process.exit(0);
  } else {
    log("❌ Some tests failed. Review above.\n");
    log("Failed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        log(`  - ${r.name}: ${r.error}`);
      });
    log();
    process.exit(1);
  }
};

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
