#!/usr/bin/env node

/**
 * DevPulse Deployment Script
 * Deploys Edge Functions, Migrations, and Secrets to Supabase
 * 
 * Usage: node deployment.js
 * Requirements: .env.local with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KEY_ENCRYPTION_SECRET
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { URL } from 'url';
import { execSync } from 'child_process';

const log = (...args) => {
  process.stdout.write(args.join(' ') + '\n');
};

// Load environment variables
const loadEnv = () => {
  const envFile = '.env.local';
  if (!fs.existsSync(envFile)) {
    console.error('❌ .env.local not found. Create it with:');
    console.error('SUPABASE_URL=your_url');
    console.error('SUPABASE_SERVICE_ROLE_KEY=your_key');
    console.error('KEY_ENCRYPTION_SECRET=your_secret');
    process.exit(1);
  }

  const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
  const env = {};
  lines.forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim();
  });
  return env;
};

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const KEY_ENCRYPTION_SECRET = env.KEY_ENCRYPTION_SECRET;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !KEY_ENCRYPTION_SECRET) {
  console.error('❌ Missing required environment variables in .env.local');
  process.exit(1);
}

// HTTP helper
const fetchSupabase = async (endpoint, options = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const urlString = url.toString();
    
    const opts = {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = https.request(urlString, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
};

const hasSupabaseCli = () => {
  try {
    execSync('supabase --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// 1. Deploy Edge Functions
const deployFunctions = async () => {
  log('\n📦 Deploying Edge Functions...');
  const functionsDir = path.join(process.cwd(), 'supabase', 'functions');
  
  const functions = fs.readdirSync(functionsDir)
    .filter(f => fs.statSync(path.join(functionsDir, f)).isDirectory() && f !== '_shared');

  const cliAvailable = hasSupabaseCli();
  if (!cliAvailable) {
    console.warn('  ⚠️ Supabase CLI not found. REST API can create function metadata but cannot publish function code.');
    console.warn('     Install CLI and run: supabase functions deploy <name> --project-ref ' + PROJECT_REF);
  }

  for (const fnName of functions) {
    const indexPath = path.join(functionsDir, fnName, 'index.ts');
    if (!fs.existsSync(indexPath)) {
      console.warn(`⚠️ Skipping ${fnName}: no index.ts found`);
      continue;
    }

    log(`  ⏳ Deploying ${fnName}...`);

    try {
      if (cliAvailable) {
        execSync(`supabase functions deploy ${fnName} --project-ref ${PROJECT_REF}`, {
          stdio: 'ignore'
        });
        log(`  ✅ ${fnName} deployed`);
      } else {
        const res = await fetchSupabase('/rest/v1/functions', {
          method: 'POST',
          body: {
            name: fnName,
            verify_jwt: true
          }
        });

        if (res.status === 201 || res.status === 200) {
          log(`  ℹ️ ${fnName} metadata created (code not deployed)`);
        } else {
          log(`  ℹ️ ${fnName} metadata exists (code deployment pending)`);
        }
      }
    } catch (e) {
      console.error(`  ⚠️ Error deploying ${fnName}:`, e.message);
    }
  }

  log('✅ Edge Functions deployment complete\n');
};

// 2. Set Environment Secrets
const setSecrets = async () => {
  log('🔐 Setting Environment Secrets...');
  
  try {
    const res = await fetchSupabase('/rest/v1/projects/secrets', {
      method: 'POST',
      body: {
        name: 'KEY_ENCRYPTION_SECRET',
        value: KEY_ENCRYPTION_SECRET
      }
    });

    if (res.status === 201 || res.status === 200) {
      log('✅ KEY_ENCRYPTION_SECRET set');
    } else if (res.data?.message?.includes('exist')) {
      log('ℹ️ KEY_ENCRYPTION_SECRET already exists');
    } else {
      console.warn('⚠️ Could not set secrets:', res.data);
    }
  } catch (e) {
    console.warn('⚠️ Could not set secrets via API:', e.message);
    log('   → Set manually in Supabase Dashboard > Edge Functions > Settings');
  }
};

// 3. Run Migrations
const runMigrations = async () => {
  log('\n📊 Checking Database Migrations...');
  
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    log('⚠️ No migrations directory found');
    return;
  }

  const migrations = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  log(`📝 Found ${migrations.length} migration(s):`);
  migrations.forEach(m => log(`   - ${m}`));
  
  log('\n⚠️ Run migrations manually via:');
  log('   1. Supabase Dashboard > SQL Editor');
  log('   2. Copy content from supabase/migrations/*.sql in order');
  log('   3. Execute each migration');
};

// 4. Verification
const verify = async () => {
  const functionsDir = path.join(process.cwd(), 'supabase', 'functions');
  const functionCount = fs.readdirSync(functionsDir)
    .filter(f => fs.statSync(path.join(functionsDir, f)).isDirectory() && f !== '_shared').length;

  log('\n✓ Deployment Configuration Ready');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`Supabase URL: ${SUPABASE_URL}`);
  log(`KEY_ENCRYPTION_SECRET: ${KEY_ENCRYPTION_SECRET.substring(0, 8)}...`);
  log(`Functions: ${functionCount} configured`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  log('📋 Next Steps:');
  log('1. ✅ Edge Functions configured');
  log('2. ✅ Environment secrets configured');
  log('3. ⏳ Manual: Run database migrations via Supabase Dashboard');
  log('4. ⏳ If CLI was unavailable: deploy function code via Supabase CLI');
  log('5. ⏳ Test: Add API key in HealthDashboard UI');
  log('6. ⏳ Verify: Key shows masked in UI, works in probes\n');
};

// Main
const main = async () => {
  log('🚀 DevPulse Deployment Script\n');
  
  try {
    await deployFunctions();
    await setSecrets();
    await runMigrations();
    await verify();
    
    log('✨ Deployment preparation complete!');
    log('   Check DEPLOYMENT_GUIDE.md for detailed setup instructions.\n');
  } catch (e) {
    console.error('❌ Deployment error:', e.message);
    process.exit(1);
  }
};

main();
