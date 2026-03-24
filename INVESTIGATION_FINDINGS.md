# DevPulse GitHub OAuth & AgentGuard Investigation

**Date:** March 25, 2026  
**Status:** Analysis Complete - Critical Issues Found

---

## 1. GITHUB OAUTH SETUP ANALYSIS

### ✅ What's Working

1. **Frontend OAuth Implementation** ([src/pages/Auth.tsx](src/pages/Auth.tsx#L70-L90))
   - GitHub OAuth button renders correctly
   - Uses Supabase auth with PKCE flow
   - Error messages guide users to enable providers in Supabase Dashboard
   - Session storage for CSRF protection with random state tokens

2. **Supabase Client Configuration** ([src/integrations/supabase/client.ts](src/integrations/supabase/client.ts))
   - `detectSessionInUrl: true` - AUTO-detects OAuth callbacks from URL
   - `flowType: 'pkce'` - Secure authorization flow enabled
   - `persistSession: true` - Sessions saved to localStorage
   - `autoRefreshToken: true` - Tokens auto-refreshed

3. **Error Handling** ([src/pages/Auth.tsx#L11-L21](src/pages/Auth.tsx#L11-L21))
   ```typescript
   function getOAuthErrorMessage(provider: "google" | "github", err: unknown) {
     if (normalized.includes("unsupported provider")) {
       return `${provider} sign-in is not enabled in Supabase Auth...`;
     }
   }
   ```

---

### ❌ CRITICAL ISSUES

#### Issue #1: GitHub OAuth Not Enabled in Supabase
**Severity:** 🔴 CRITICAL  
**Location:** Supabase Dashboard (not in codebase)  
**Fix Required:**
1. Go to Supabase Dashboard → Authentication → Providers
2. Find and enable "GitHub" provider
3. Enter GitHub OAuth App credentials:
   - Client ID
   - Client Secret
4. Register callback URLs (see below)

#### Issue #2: Redirect URLs Not Configured
**Severity:** 🔴 CRITICAL  
**Location:** Supabase Dashboard → OAuth Redirect URLs  
**Current Code:**
```typescript
redirectTo: `${window.location.origin}${next}` // e.g., https://devpulse.in/agentguard
```
**Problem:** Supabase callback URL doesn't match!

**Fix Required in Supabase:**
Add these redirect URLs:
```
https://devpulse.in/auth
https://devpulse.in/agentguard
https://www.devpulse.in/auth
https://www.devpulse.in/agentguard
http://localhost:5173/auth
http://localhost:5173/agentguard
```

#### Issue #3: Multiple Auth Callback Pages
**Severity:** 🟡 MEDIUM  
**Files:**
- [src/pages/Auth.tsx](src/pages/Auth.tsx) - redirects to `/agentguard` (line 75)
- [src/pages/AgentGuardAuth.tsx](src/pages/AgentGuardAuth.tsx) - redirects to `/agentguard` (line 76)

**Problem:** Two nearly identical auth pages cause confusion  
**Fix:** Consolidate into single `/auth` page

#### Issue #4: No Environment Variables Documentation
**Severity:** 🟡 MEDIUM  
**Location:** [.env.example](.env.example)  
**Current:**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-publishable-key
VITE_API_BASE_URL=http://localhost:8000
```
**Missing:** No notes about GitHub OAuth setup steps

#### Issue #5: GitHub CI/CD Integration ≠ OAuth
**Severity:** 🟡 MEDIUM  
**Location:** [backend/routers/ci_cd.py](backend/routers/ci_cd.py#L39)  
**Problem:** Backend has GitHub integration endpoint, but it's for:
- GitHub webhooks (PR events)
- CI/CD checks
- Not OAuth authentication!

**Code:**
```python
@router.post("/ci-cd/github/configure")
async def configure_github(github_token: str, repository: str, ...):
    # This requires a GitHub PAT, NOT OAuth
```

---

## 2. AGENT GUARD FEATURES ANALYSIS

### ✅ What's Implemented

#### 2.1 Subscription-Based Gate
**Location:** [src/pages/AgentGuardGate.tsx](src/pages/AgentGuardGate.tsx)  
**Logic:**
```tsx
const { tier, subscribed, loading } = useSubscription();
return subscribed && tier !== "free" ? <AgentGuardDashboard /> : <AgentGuardLanding />;
```
✅ Shows landing page to unauthenticated users  
✅ Shows landing page to free tier users (upsell)  
✅ Shows dashboard to Pro/Team users  

#### 2.2 Subscription Tiers
**Location:** [src/hooks/useSubscription.ts](src/hooks/useSubscription.ts)

| Tier | Agents | Tasks/month | Price ID |
|------|--------|-------------|----------|
| Free | 1 | 100 | N/A |
| Pro | 10 | Unlimited | price_1T8lW8IJZyuGgRb844xhVrFp |
| Team | 50 | Unlimited | price_1T8lePIJZyuGgRb8pe7BLhha |

✅ Stripe price IDs configured  
✅ Checkout function exists via Supabase

#### 2.3 Dashboard Features (Mostly UI)
**Location:** [src/pages/AgentGuardDashboard.tsx](src/pages/AgentGuardDashboard.tsx)

Implemented:
- ✅ Agent list/creation
- ✅ Cost tracking and charts
- ✅ Alert feed
- ✅ Onboarding tour
- ✅ Webhook configuration UI
- ✅ Team workspace UI
- ✅ Settings page

Features Using Supabase Functions:
```tsx
supabase.functions.invoke("loop-detection", {...})
supabase.functions.invoke("leak-scanner", {...})
supabase.functions.invoke("rate-limiter", {...})
supabase.functions.invoke("check-subscription", {...})
supabase.functions.invoke("create-checkout", {...})
supabase.functions.invoke("cost-forecast-ai", {...})
```

---

### ❌ CRITICAL ISSUES

#### Issue #1: Missing Database Schema
**Severity:** 🔴 CRITICAL  
**Location:** `supabase/migrations/` (NOT FOUND!)

**Required Tables:**
```sql
-- agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT,
  status TEXT ('active', 'paused', 'stopped', 'error'),
  max_cost_per_task DECIMAL,
  max_api_calls_per_min INT,
  max_reasoning_steps INT,
  budget_amount DECIMAL,
  total_cost DECIMAL,
  total_api_calls INT,
  total_tasks INT,
  created_at TIMESTAMP
);

-- alerts table
CREATE TABLE alerts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  alert_type TEXT,
  severity TEXT ('low', 'medium', 'high', 'critical'),
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN,
  agent_id UUID,
  created_at TIMESTAMP
);

-- audit_log table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id UUID,
  action TEXT,
  details JSONB,
  created_at TIMESTAMP
);
```

**Impact:** Dashboard will fail with table not found errors!

#### Issue #2: Backend vs Frontend API Mismatch
**Severity:** 🔴 CRITICAL

**Frontend calls:** Supabase Functions
```tsx
await supabase.functions.invoke("loop-detection", {...})
```

**Backend provides:** REST endpoints via routers
```python
@app.include_router(scan.router)  # GET /scan, POST /scan
@app.include_router(alerts.router)  # GET /alerts, PATCH /alerts
```

**Problem:** No `/agentguard/*` endpoints exist!  
**Missing endpoints:**
- POST `/agentguard/agents` - Create agent
- GET `/agentguard/agents/{agent_id}` - Get agent details
- PATCH `/agentguard/agents/{agent_id}` - Update agent
- GET `/agentguard/agents/{agent_id}/costs` - Get cost data
- GET `/agentguard/agents/{agent_id}/logs` - Get execution logs

#### Issue #3: AI Model Tracking Not Wired
**Severity:** 🔴 CRITICAL  
**Location:** [backend/routers/llm.py](backend/routers/llm.py) exists but...

**Dashboard expects:** Per-agent cost breakdown by model (OpenAI, Claude, Anthropic, etc.)  
**Backend provides:** Generic LLM usage tracking  
**Reality:** No direct connection to agent cost calculations!

#### Issue #4: Supabase Functions May Be Missing
**Severity:** 🟡 HIGH  
**Location:** [supabase/functions/](supabase/functions/)

Functions Dashboard calls:
- loop-detection ✅ (exists)
- leak-scanner ✅ (exists)
- rate-limiter ✅ (exists)
- check-subscription ✅ (exists)
- create-checkout ✅ (exists)
- cost-forecast-ai ✅ (exists)
- user-api-keys ✅ (exists)

But are they deployed? Check `supabase status` to verify.

#### Issue #5: Team Workspace Backend Missing
**Severity:** 🟡 HIGH  
**Location:** [src/components/agentguard/TeamWorkspace.tsx](src/components/agentguard/TeamWorkspace.tsx)

Frontend component exists but:
- ❌ No backend endpoints for team operations
- ❌ No team table in database
- ❌ No invite/permissions system

#### Issue #6: Weak Protected Routes
**Severity:** 🟡 MEDIUM  
**Location:** [src/pages/AgentGuardDashboard.tsx#L109-L117](src/pages/AgentGuardDashboard.tsx#L109-L117)

```tsx
useEffect(() => {
  if (!authLoading && !user) navigate("/auth");
}, [user, authLoading, navigate]);
```

**Problem:** Each page manually checks auth instead of using a ProtectedRoute component

---

## 3. ROUTING ANALYSIS

### Route Structure

```
/auth                           → Auth.tsx (unified login)
/agentguard                     → AgentGuardGate (subscription check)
/agentguard/landing             → AgentGuardLanding (upsell)
/agentguard/auth                → AgentGuardAuth (backup auth)
/agentguard/docs                → AgentGuardSDKDocs
/agentguard/settings            → AgentGuardSettings
/agentguard/agent/:agentId      → AgentGuardAgentDetail
/devpulse/security              → DevPulseSecurityDashboard
```

### ✅ What's Working

1. ✅ Lazy loading of all AgentGuard pages
2. ✅ SuspenseFallback with loader UI
3. ✅ OAuth redirect URL handling (`detectSessionInUrl: true`)
4. ✅ Error boundaries and splash screen

### ❌ Issues

#### Issue #1: Duplicate Auth Pages
**Files:**
- [src/pages/Auth.tsx](src/pages/Auth.tsx) - Main auth page
- [src/pages/AgentGuardAuth.tsx](src/pages/AgentGuardAuth.tsx) - Alternative auth page

Both have nearly identical code. Consolidate!

#### Issue #2: No ProtectedRoute Component
**Current pattern (BAD):**
```tsx
export default function Dashboard() {
  const { user, loading } = useAuth();
  
  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);
}
```

**Better pattern:**
```tsx
<ProtectedRoute requiredTier="pro">
  <AgentGuardDashboard />
</ProtectedRoute>
```

#### Issue #3: Loose Subscription Check
**Location:** [src/hooks/useSubscription.ts](src/hooks/useSubscription.ts#L48)

```tsx
const checkSubscription = useCallback(async () => {
  if (!user) {
    setLoading(false);
    return;  // Returns early, doesn't show error
  }
  try {
    const { data, error } = await supabase.functions.invoke("check-subscription");
    if (error) throw error;
    // ...
  } catch (err) {
    console.error("Subscription check failed:", err);
    setSubscribed(false);
    setTier("free");  // Silently downgrades to free!
  }
}, [user]);
```

**Problem:** Errors silently downgrade users to free tier

---

## 4. WHAT NEEDS TO BE DONE (PRIORITY ORDER)

### 🔴 CRITICAL (Blocks Everything)

1. **Enable GitHub OAuth in Supabase Dashboard**
   - Go to Supabase Dashboard → Authentication → Providers
   - Enable GitHub
   - Add Client ID/Secret
   - Register all redirect URLs (see section 1.2)

2. **Create Missing Database Migrations**
   - Create `agents` table with all fields
   - Create `alerts` table with RLS policies
   - Create `audit_log` table
   - Create `webhook_configs` table (partially exists)
   - Create `team_members` table (for team workspace)

3. **Create AgentGuard Backend Endpoints**
   ```python
   /agentguard/agents (GET, POST)
   /agentguard/agents/{id} (GET, PATCH, DELETE)
   /agentguard/agents/{id}/costs (GET)
   /agentguard/agents/{id}/logs (GET)
   /agentguard/agents/{id}/status (PATCH)
   /agentguard/webhooks (GET, POST, DELETE)
   /agentguard/team (GET, POST members)
   ```

4. **Wire Frontend to Correct API**
   - Dashboard should call REST endpoints, OR
   - Create Supabase functions that call backend endpoints

---

### 🟡 HIGH PRIORITY (Prevents Deployment)

1. **Consolidate Auth Pages**
   - Merge `Auth.tsx` and `AgentGuardAuth.tsx`
   - Remove `AgentGuardAuth.tsx`
   - Update routes to use single `/auth` endpoint

2. **Fix Subscription Check Error Handling**
   - Don't silently downgrade to free tier
   - Show user-facing error message
   - Log to monitoring service

3. **Implement Team Workspace Backend**
   - POST `/agentguard/team/members` (invite)
   - GET `/agentguard/team/members` (list)
   - DELETE `/agentguard/team/members/{id}` (remove)
   - PATCH `/agentguard/team/members/{id}` (update role)

4. **Add AI Model Cost Tracking**
   - OpenAI, Claude, Cohere, Hugging Face tracking
   - Per-model cost breakdown
   - Token attribution (already exists in backend!)

---

### 🟠 MEDIUM PRIORITY (Quality)

1. **Create ProtectedRoute Component**
   ```tsx
   <ProtectedRoute requiredTier="pro" redirectTo="/agentguard">
     <AgentGuardDashboard />
   </ProtectedRoute>
   ```

2. **Add 403/Access Denied Page**
   - For users with insufficient permissions
   - Current behavior: Silent redirect is confusing

3. **Update .env.example Documentation**
   - Add comments about GitHub OAuth setup
   - Add notes about Stripe price IDs
   - Add notes about Supabase functions deployment

4. **Add Row-Level Security (RLS) Policies**
   - Ensure users can't access other users' agents
   - Ensure team members can only access shared agents
   - Add policy verification tests

---

## 5. DEPLOYMENT CHECKLIST

- [ ] GitHub OAuth enabled in Supabase
- [ ] All redirect URLs registered
- [ ] Database migrations applied
- [ ] AgentGuard backend API endpoints created
- [ ] Subscription check error handling fixed
- [ ] Auth pages consolidated
- [ ] Team workspace backend implemented
- [ ] AI model tracking wired up
- [ ] RLS policies verified
- [ ] ProtectedRoute component implemented
- [ ] Environment variables documented
- [ ] Supabase functions deployed and verified

---

## 6. KEY FINDINGS

| Category | Status | Risk |
|----------|--------|------|
| GitHub OAuth Frontend | ✅ Implemented | 🟢 Code-ready, waiting for Supabase config |
| GitHub OAuth Backend | ⚠️ Partial | 🔴 Missing Supabase provider setup |
| AgentGuard Frontend | ✅ Implemented | 🔴 No backend to call |
| AgentGuard Backend | ❌ Missing | 🔴 Must create new endpoints |
| Database Schema | ❌ Missing | 🔴 Dashboard will crash without migrations |
| Routing | ✅ Mostly Good | 🟡 Needs ProtectedRoute component |
| Error Handling | ⚠️ Loose | 🟡 Silent failures, needs UI feedback |
| Subscription System | ✅ Configured | 🟡 Error handling needs improvement |

---

## Summary

The DevPulse application is **~70% ready for production** but has **critical gaps**:

1. **GitHub OAuth** - Frontend is ready, just needs Supabase configuration + redirect URLs
2. **AgentGuard** - Frontend dashboard exists but no backend API or database schema
3. **Routing** - Works but needs consolidation of duplicate auth pages
4. **Security** - Basic protections in place but weak error handling

**Estimated work to deploy:** 3-5 days for a single developer

**Risk level:** MEDIUM - Missing backend could cause production crashes
