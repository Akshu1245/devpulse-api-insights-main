# DevPulse Deployment Quick Reference

## ✓ Completed: Supabase CLI & Setup

- [x] Generated .env.local with encryption secret
- [x] Validated Edge Functions structure (11 functions ready)
- [x] Validated database migrations
- [x] Created deployment scripts
- [x] Created deployment guide

**Generated Secret:** `289232DC5879ED590B2CDB3513A633D6950FF6BCF389AFC3E442D94C601DA0DE`

---

## Configure Your Supabase Credentials

### 1. Update `.env.local` with your Supabase credentials:

<details>
<summary>Where to find these values:</summary>

| Variable | Where to find it |
|----------|-----------------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon/public key |
| `SUPABASE_URL` | Same as VITE_SUPABASE_URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key (⚠️ Keep secret!) |
| `KEY_ENCRYPTION_SECRET` | Already generated: See above |

</details>

### 2. Current .env.local Status:

```dotenv
VITE_SUPABASE_URL=❌ NEEDS UPDATE (your_supabase_project_url)
VITE_SUPABASE_ANON_KEY=❌ NEEDS UPDATE (your_anon_key)
SUPABASE_URL=❌ NEEDS UPDATE (your_supabase_project_url)
SUPABASE_SERVICE_ROLE_KEY=❌ NEEDS UPDATE (your_service_role_key)
KEY_ENCRYPTION_SECRET=✅ READY (already generated)
```

---

## Deploy Edge Functions & Database

### Choose your deployment method:

#### Option A: Quick Deploy via Dashboard (Recommended First-Time)

```
1. Go to your Supabase project dashboard
2. Find Edge Functions section
3. For each function in supabase/functions/*:
   - Create new function
   - Copy index.ts content from folder
   - Deploy
4. Set KEY_ENCRYPTION_SECRET in function settings
5. Run migrations via SQL Editor (copy from supabase-setup.sql)
```

#### Option B: Automated via Node.js Script

```powershell
# After updating .env.local with credentials:
node deployment.js
```

#### Option C: Install Full Supabase CLI (Advanced)

```powershell
# Download binary directly:
$url = "https://github.com/supabase/cli/releases/download/v1.208.0/supabase_windows_amd64.zip"
# (or use your package manager if available)

# Then deploy:
supabase functions deploy
supabase db push
```

---

## VERIFY: Post-Deployment Checklist

After deploying, verify everything works:

```
[ ] user-api-keys function appears in Supabase dashboard
[ ] KEY_ENCRYPTION_SECRET is set in function environment
[ ] Database migrations applied (check Supabase SQL)
[ ] All 11 Edge Functions deployed
[ ] Frontend starts: npm run dev (or bun dev)
[ ] HealthDashboard loads without errors
[ ] Can add API keys with masked display (****)
[ ] API keys work in health checks
```

---

## NEXT STEPS

### Step 1: Update Credentials
```powershell
# Edit .env.local with your Supabase credentials
notepad .env.local
```

### Step 2: Deploy (Pick ONE method)

**Quickest start:**
```powershell
# Option A: Manual dashboard upload (10 min)
# Go to your Supabase project in browser
# See DEPLOYMENT_GUIDE.md for detailed steps
```

**If you have Node.js:**
```powershell
# Option B: Automated script (5 min)
node deployment.js
```

### Step 3: Test
```powershell
# Start the app
npm run dev
# or
bun dev
```

---

## 📖 Full Documentation

- **DEPLOYMENT_GUIDE.md** - Complete step-by-step guide
- **deployment.js** - Node.js automation script
- **setup-supabase.ps1** - PowerShell setup validation

---

## 🆘 Troubleshooting

### "SUPABASE_URL is required" error
→ Update .env.local with actual Supabase values

### "KEY_ENCRYPTION_SECRET not set" error
→ Set in Supabase Dashboard > Edge Functions > Settings

### "Functions won't deploy"
→ Check Deno syntax in Supabase editor, try manual upload

### "Can't add API keys"
→ Verify user-api-keys function is deployed
→ Check KEY_ENCRYPTION_SECRET is deployed with function
→ Check browser console for errors

---

## 💡 Key Info

- **Encryption Algorithm:** AES-GCM (256-bit)
- **Key Storage:** Server-side encrypted in Supabase
- **Display Format:** Masked as "••••" + last 4 chars
- **Fallback:** Guest mode with localStorage
- **Functions:** 11 total (1 new + 10 existing)

---

**Ready?** Edit `.env.local` and pick your deployment method above! 🚀
