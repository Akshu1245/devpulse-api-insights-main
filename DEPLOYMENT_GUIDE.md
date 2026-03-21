# DevPulse Deployment Guide

## Prerequisites

- Supabase Project URL and API Key (with service_role permissions)
- Node.js v18+ installed
- Environment variables configured

## Step 1: Environment Setup

### Create `.env.local` with:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
KEY_ENCRYPTION_SECRET=your_32_byte_hex_secret
```

### Generate KEY_ENCRYPTION_SECRET:

```powershell
# Windows PowerShell
$secret = -join ((0..63) | ForEach-Object { '{0:X}' -f (Get-Random -Maximum 16) })
Write-Host "KEY_ENCRYPTION_SECRET=$secret"
```

## Step 2: Database Setup

### Option A: Using Supabase Dashboard

1. Go to Supabase Dashboard → Your Project → SQL Editor
2. Create new query and execute [this SQL setup file](supabase-setup.sql)
3. Execute pending migrations in order:
   - `supabase/migrations/*.sql` (in numeric order)

### Option B: Using Node.js Deployment Script

Run the included deployment script:

```powershell
cd "path\to\devpulse-api-insights-main"
node deployment.js
```

## Step 3: Deploy Edge Functions

### Option A: Using Supabase Dashboard

1. Navigate to Edge Functions in your Supabase project
2. For each function folder in `supabase/functions/`:
   - Create new function with same name
   - Copy entire `index.ts` content
   - Set environment variables (if needed)
   - Deploy

### Option B: Manual Function Upload

Upload these critical functions:

- **user-api-keys** (NEW - CRITICAL)
  - Purpose: Secure API key vault with AES-GCM encryption
  - File: `supabase/functions/user-api-keys/index.ts`
  - Env: `KEY_ENCRYPTION_SECRET` (required)

- **api-proxy** (UPDATED)
  - Purpose: Rate-limited upstream proxy with decryption
  - File: `supabase/functions/api-proxy/index.ts`
  - Env: `KEY_ENCRYPTION_SECRET` (required)

- Other functions (unchanged):
  - check-subscription
  - cost-forecast-ai
  - create-checkout
  - customer-portal
  - leak-scanner
  - loop-detection
  - rate-limiter
  - send-email-alert
  - send-webhook

## Step 4: Function Configuration

### Set Environment Variables in Supabase

Go to **Edge Functions** → **Settings** and add:

```
KEY_ENCRYPTION_SECRET=<your_32_byte_hex_secret>
```

This secret must be the same generated in Step 1.

## Step 5: Test Deployment

### Test API Key Encryption

```powershell
# Test function invocation
$headers = @{
  'Authorization' = 'Bearer your_anon_key'
  'Content-Type' = 'application/json'
}

$body = @{
  action = "upsert"
  provider = "nasa"
  key = "test_key_value"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://your-project.supabase.co/functions/v1/user-api-keys" `
  -Method POST `
  -Headers $headers `
  -Body $body
```

### Verify In-Browser Usage

1. Navigate to HealthDashboard
2. Add an API key via "Add Custom Key" button
3. Verify key displays masked (••••****) in UI
4. Verify key works in health checks

## Step 6: Production Hardening Checklist

- [ ] KEY_ENCRYPTION_SECRET set in Supabase
- [ ] user-api-keys function deployed  
- [ ] api-proxy function updated with decryption
- [ ] Database migrations applied
- [ ] All tables created (user_api_keys, agents, etc.)
- [ ] Realtime subscriptions enabled
- [ ] Rate limiting configured in api-proxy
- [ ] CORS headers configured for Edge Functions
- [ ] Webhook endpoints configured (if using)
- [ ] Email service configured (if using send-email-alert)

## Troubleshooting

### "KEY_ENCRYPTION_SECRET not set" Error
- Set environment variable in Supabase Dashboard
- Redeploy functions
- Restart browser session

### "Decrypt failed" Error
- Verify SECRET matches between function and stored keys
- Check keys weren't encrypted with different secret
- Clear browser cache and re-add keys

### Function Deployment Fails
- Verify Deno syntax (use Supabase's online editor)
- Check all imports resolve (std@0.190.0, npm:* packages)
- Verify CORS headers present in function response
- Check function permissions (service role allowed)

## Key Storage Migration

### For Existing Users:
1. Old localStorage keys will still work during transition
2. New keys added via UI go to server vault automatically
3. On next login, migrate old keys:
   ```javascript
   const legacyKeys = JSON.parse(localStorage.getItem('apiKeys') || '{}');
   // Keys auto-migrate on first API call
   ```

### For New Users:
- All keys stored server-side from first add
- No migration needed

## Rollback Procedure

If issues occur:

1. **Revert function changes**: Upload previous index.ts from backup
2. **Revert database**: Run `pg_restore` from backup
3. **Revert secrets**: Remove KEY_ENCRYPTION_SECRET from env
4. **Test**: Verify old API key flow works

## Next Steps

1. Deploy to staging environment first
2. Test with sample API keys  
3. Monitor logs in Supabase Dashboard
4. Promote to production after validation
5. Notify users of new secure key storage

---

For support: Check Supabase logs, verify settings, confirm migrations applied.
