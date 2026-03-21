# Pre-Deployment Checklist

Complete this checklist before deploying to production.

## 1. Credentials & Configuration ✓ Required

- [ ] Supabase Project URL obtained (from Settings > API)
- [ ] Anon Key obtained (from Settings > API)
- [ ] Service Role Key obtained (from Settings > API - keep secret!)
- [ ] `.env.local` updated with all 4 credentials
- [ ] `.env.local` committed to secure location (NOT git)
- [ ] KEY_ENCRYPTION_SECRET verified (32-byte hex format)

## 2. Database Setup ✓ Required

- [ ] All migrations validated (SQL syntax correct)
- [ ] Migration files present:
  - [x] `20260308105514_*.sql` - Initial schema
  - [x] `20260308110847_*.sql` - Additional tables
  - [x] `20260308145535_*.sql` - Updates
  - [x] `20260308180705_*.sql` - Final schema
  - [x] `20260319100000_add_user_api_keys.sql` - API keys table
  - [x] `20260319120000_add_budget_amount.sql` - Budget tracking
  - [x] `20260319150000_high_traffic_indexes.sql` - Performance indexes
  - [x] `20260321000000_add_audit_logging.sql` - Audit trail
- [ ] Total: 8 migrations to run in order
- [ ] Row Level Security (RLS) policies reviewed
- [ ] Primary foreign keys verified
- [ ] Indexes created for performance

## 3. Edge Functions Setup ✓ Required

### Core Functions
- [ ] `user-api-keys` [NEW]
  - [x] Code reviewed
  - [x] Audit logging added
  - [x] Error handling implemented
  - [ ] Deploy to Supabase
  - [ ] Verify function creates in dashboard
  - [ ] Test with sample key

- [ ] `api-proxy` [UPDATED]
  - [x] Server-side decryption implemented
  - [x] CORS headers configured
  - [ ] Deploy to Supabase
  - [ ] Verify decryption works

### Supporting Functions (no changes needed, deploy as-is)
- [ ] `check-subscription`
- [ ] `cost-forecast-ai`
- [ ] `create-checkout`
- [ ] `customer-portal`
- [ ] `leak-scanner`
- [ ] `loop-detection`
- [ ] `rate-limiter`
- [ ] `send-email-alert`
- [ ] `send-webhook`

### New Advisory Functions
- [ ] `health-check` [NEW]
  - [x] Code created
  - [ ] Deploy to Supabase
  - [ ] Test endpoint: `GET /functions/v1/health-check`

**Total: 12 Edge Functions to deploy**

## 4. Environment Variables ✓ Required

Set in Supabase Dashboard > Edge Functions > Settings:

- [ ] `KEY_ENCRYPTION_SECRET` = [your 32-byte hex secret]
- [ ] `SUPABASE_URL` = [injected by Supabase]
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = [injected by Supabase]

## 5. Security Verification ✓ Required

- [ ] API keys never logged in plain text
- [ ] Encryption secret not in code/comments
- [ ] Database RLS policies enabled on all tables
- [ ] Service Role Key kept private (not in frontend code)
- [ ] CORS headers configured for allowed origins
- [ ] Error messages don't leak sensitive data
- [ ] Audit logging for all key operations

## 6. Frontend Code ✓ Complete

- [x] Build succeeds: `npm run build` or `bun build`
- [x] Tests pass: `npm test` or `bun test`
- [x] Linting passes: `npm run lint`
- [x] No demo content (all live data)
- [x] Error handling for failed API calls
- [x] Loading states for async operations
- [x] Encryption-compatible key display (masked format)

Build output:
```
✓ 2964 modules transformed
✓ 1.1MB bundle size
✓ 0 errors
✓ 18 warnings (pre-existing, not new)
```

## 7. Database Performance ✓ Required

- [ ] Indexes created on:
  - [x] `user_api_keys(user_id)`
  - [x] `agents(user_id)`
  - [x] `audit_log(user_id, created_at, action)`
- [ ] Query patterns reviewed
- [ ] N+1 queries eliminated
- [ ] Connection pooling configured

## 8. Monitoring & Logging ✓ Ready

- [ ] Audit log table created and tested
- [ ] Error logging in all Edge Functions
- [ ] Health check function deployed
- [ ] Supabase logs accessible for debugging
- [ ] Alert rules to be set up post-deployment (optional)

## 9. Backup & Recovery ✓ Planned

- [ ] Backup procedure documented
- [ ] Database exports scheduled (recommend daily)
- [ ] Disaster recovery steps written
- [ ] Contact person assigned for emergencies

## 10. API Documentation ✓ Ready

- [ ] Edge Function endpoints documented:
  - [x] `POST /functions/v1/user-api-keys` - Key management
  - [x] `GET /functions/v1/health-check` - System health
- [ ] Authentication requirements clear
- [ ] CORS requirements documented
- [ ] Error response formats standardized

## 11. Testing Before Live ✓ Required

- [ ] Test user can add API key
- [ ] Test key displays masked
- [ ] Test key used in API calls
- [ ] Test key deletion
- [ ] Test audit log entries appear
- [ ] Test health check returns success
- [ ] Test error scenarios
- [ ] Test with multiple concurrent users

## 12. Team Communication ✓ Ready

- [ ] Deployment schedule set
- [ ] Team notified of changes
- [ ] Rollback plan explained
- [ ] Support contacts listed
- [ ] Postmortem plan if issues occur

---

## Deployment Steps

### Step 1: Database
```sql
-- Run in Supabase SQL Editor in order:
1. 20260308105514_*.sql
2. 20260308110847_*.sql
3. 20260308145535_*.sql
4. 20260308180705_*.sql
5. 20260319100000_add_user_api_keys.sql
6. 20260319120000_add_budget_amount.sql
7. 20260319150000_high_traffic_indexes.sql
8. 20260321000000_add_audit_logging.sql
```

### Step 2: Edge Functions
```
Deploy 12 functions to Supabase via Dashboard
Set KEY_ENCRYPTION_SECRET in each function environment
```

### Step 3: Frontend
```
npm run build
Deploy dist/ to hosting platform
```

---

## Sign-Off

- [ ] All checklist items complete
- [ ] Deployment approved by team lead
- [ ] Rollback plan reviewed
- [ ] Support team briefed
- [ ] Ready to deploy

**Signed:** _________________ **Date:** _________

---

**Note:** Keep this checklist for audit trail. Archive after successful deployment.
