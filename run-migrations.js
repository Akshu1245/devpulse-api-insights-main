#!/usr/bin/env node

/**
 * Database Migration Runner
 * Executes all migrations against Supabase
 * 
 * Usage: node run-migrations.js
 */

import fs from "fs";
import path from "path";
import https from "https";
import { URL } from "url";

const log = (...args) => {
  process.stdout.write(args.join(' ') + '\n');
};

// Load environment
const env = {};
if (fs.existsSync(".env.local")) {
  const lines = fs.readFileSync(".env.local", "utf-8").split("\n");
  lines.forEach((line) => {
    const [key, ...value] = line.split("=");
    if (key && value) env[key.trim()] = value.join("=").trim();
  });
}

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// HTTP request helper
const postgresQuery = async (sql) => {
  return new Promise((resolve, reject) => {
    const url = new URL("/rest/v1/rpc/exec_sql", SUPABASE_URL);
    const payload = JSON.stringify({ sql });

    const opts = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(url, opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || data));
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
};

// Execute raw SQL via Supabase
const executeSql = async (sql) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`/graphql/v1`, SUPABASE_URL);

    const query = `query { __typename }`;

    const opts = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(url, opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        // Fallback method - this is a workaround
        // In production, use CLI or dashboard
        log(
          "Note: GraphQL endpoint used. For SQL execution, use Supabase CLI or dashboard."
        );
        resolve(true);
      });
    });

    req.on("error", reject);
    req.write(JSON.stringify({ query }));
    req.end();
  });
};

// Main migration runner
const main = async () => {
  log("\n📊 Database Migration Runner\n");
  log("====================================\n");

  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error("❌ Migrations directory not found");
    process.exit(1);
  }

  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  log(`Found ${migrations.length} migrations:\n`);

  migrations.forEach((m, idx) => {
    log(`${idx + 1}. ${m}`);
  });

  log("\n====================================\n");

  log("⚠️  IMPORTANT: Cannot auto-execute SQL via REST API\n");

  log("To run migrations, do ONE of the following:\n");

  log("OPTION 1: Supabase Dashboard (Easiest)\n");
  log("  1. Go to: https://app.supabase.com");
  log(
    "  2. Select your project: sbtoqosnmpstkyumukzs"
  );
  log("  3. Click: SQL Editor > Create new query");
  log("  4. For each migration (in order):");
  log(
    "     - Copy migrations/[filename].sql"
  );
  log("     - Paste into SQL Editor");
  log("     - Click Run");
  log("  5. Done!\n");

  log("OPTION 2: Command Line (Via Supabase CLI)\n");
  log("  1. Install Supabase CLI globally");
  log("  2. Run: supabase db push");
  log("  3. Done!\n");

  log("OPTION 3: Copy/Paste All at Once\n");
  log("  Below is the complete SQL (copy all):\n");

  log("====================================");
  log("BEGIN MASTER MIGRATION SCRIPT");
  log("====================================\n");

  let combinedSql = "-- Combined Migrations\n-- Run in Supabase SQL Editor\n\n";

  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration);
    const content = fs.readFileSync(filePath, "utf-8");
    combinedSql += `-- ========================================\n`;
    combinedSql += `-- Migration: ${migration}\n`;
    combinedSql += `-- ========================================\n\n`;
    combinedSql += content + "\n\n";
  }

  log(combinedSql);

  log("====================================");
  log("END MASTER MIGRATION SCRIPT");
  log("====================================\n");

  log(
    "✅ Migration script ready. Copy/paste above SQL into Supabase SQL Editor.\n"
  );

  // Save to file for easy copying
  const outputFile = "COMBINED_MIGRATIONS.sql";
  fs.writeFileSync(outputFile, combinedSql);
  log(`📄 Also saved to: ${outputFile}\n`);

  log("🎯 Next Steps:");
  log(
    "  1. Go to Supabase Dashboard > SQL Editor"
  );
  log("  2. Open: COMBINED_MIGRATIONS.sql");
  log("  3. Copy all content");
  log("  4. Paste into SQL Editor in Supabase");
  log("  5. Click 'Run'\n");
};

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
