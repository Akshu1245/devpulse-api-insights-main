# 🚀 DevPulse Production Deployment Guide

> Vite + React Frontend on **Vercel** | Express Backend on **Railway**

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Backend Deployment (Railway)](#backend-deployment-railway)
3. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
4. [Environment Variables Setup](#environment-variables-setup)
5. [Testing & Validation](#testing--validation)
6. [Troubleshooting](#troubleshooting)
7. [Post-Deployment Monitoring](#post-deployment-monitoring)

---

## Architecture Overview

```
┌─────────────────┐                ┌──────────────────┐
│  Vercel (React) │  ◄──────────►  │  Railway (Node)  │
│    Frontend     │   HTTPS API    │    Backend       │
│  https://...    │                │  https://...     │
└─────────────────┘                └──────────────────┘
        │                                  │
        │                         ┌────────┴────────┐
        │                         │                 │
        │                      Prisma         Supabase
        │                         │                 │
        └─────────────────────────┴─────────────────┘
                    PostgreSQL DB (Supabase)
```

---

## Backend Deployment (Railway)

### Prerequisites

- GitHub account with this repo
- Railway account (https://railway.app)
- Supabase database connection string

### Step 1: Set Up Railway Project

1. Go to https://railway.app and log in/sign up
2. Click **New Project** → **Deploy from GitHub**
3. Select your GitHub repository
4. Railway automatically detects the Node.js project

### Step 2: Configure Build & Start Commands

In Railway dashboard:

1. Go to **Variables** section
2. Add these environment variables (see [Environment Variables](#environment-variables-setup)):
   - `NODE_ENV=production`
   - `PORT=3001` (Railway sets this automatically)
   - `JWT_SECRET` (generate new)
   - `DATABASE_URL` (from Supabase)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `VITE_APP_ORIGIN` (will be set later after Vercel deployment)
   - All other required keys (Gemini, Stripe, SMTP, etc.)

3. Go to **Settings** → **Build** section
4. Set the following:

   **Build Command:**
   ```bash
   npm run build:server
   ```

   **Start Command:**
   ```bash
   npm start
   ```

   **Root Directory:** (leave blank or `.`)

### Step 3: Deploy to Railway

1. Click **Trigger Deploy** button
2. Monitor logs in the **Deployments** tab
3. Once successful, you'll see a URL like: `https://your-app.up.railway.app`
4. Test the health endpoint:
   ```bash
   curl https://your-app.up.railway.app/health
   ```
   Expected response:
   ```json
   {"ok": true, "service": "devpulse-hybrid-backend"}
   ```

### Step 4: Configure CORS Origins

Once you have your Vercel URL, update in Railway:

1. Go to Railway **Variables**
2. Update `VITE_APP_ORIGIN`:
   ```
   https://your-vercel-domain.vercel.app,https://your-custom-domain.com
   ```
3. Click **Redeploy** → **Confirm**

---

## Frontend Deployment (Vercel)

### Prerequisites

- GitHub repository connected
- Vercel account

### Step 1: Connect Repository to Vercel

1. Go to https://vercel.com and log in/sign up
2. Click **Add New** → **Project**
3. Select your GitHub repository
4. Vercel auto-detects Vite configuration

### Step 2: Configure Build Settings

In Vercel import dialog:

- **Framework:** Vite (auto-detected)
- **Build Command:** Keep default: `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### Step 3: Set Environment Variables

In Vercel dashboard for your project:

1. Go to **Settings** → **Environment Variables**
2. Add these variables:

   ```
   VITE_BACKEND_URL = https://your-railway-app.up.railway.app
   VITE_SUPABASE_URL = https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY = your-anon-key
   VITE_CLERK_PUBLISHABLE_KEY = pk_live_xxx
   ```

3. Select Environments: `Production`, `Preview`, `Development`
4. Click **Save**

### Step 4: Deploy

1. Click **Deploy** button
2. Wait for build and deployment to complete
3. You'll get a URL like: `https://your-project.vercel.app`

### Step 5: Test Frontend

1. Open your Vercel URL
2. Check browser console for errors
3. Verify API calls reach the backend:
   - Open DevTools → Network tab
   - Make an API request (login, scan, etc.)
   - Confirm requests go to your Railway backend URL

---

## Environment Variables Setup

### Required for Railway (Backend)

```env
# Server
NODE_ENV=production
PORT=3001
API_URL=https://your-railway-app.up.railway.app
VITE_APP_ORIGIN=https://your-vercel-domain.vercel.app

# Auth
JWT_SECRET=<generate: python -c "import secrets; print(secrets.token_hex(32))">
JWT_EXPIRE_MINUTES=1440

# Database
DATABASE_URL=postgresql://[user]:[password]@[host]:[port]/[db]

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>

# External APIs
GEMINI_API_KEY=<your-gemini-key>
STRIPE_SECRET_KEY=sk_live_xxx
CLERK_SECRET_KEY=sk_test_xxx

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=<app-specific-password>
SMTP_FROM=noreply@devpulse.in

# Logging
LOG_LEVEL=info
SENTRY_DSN=<optional>

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_SCAN_MAX=50
```

### Required for Vercel (Frontend)

```env
VITE_BACKEND_URL=https://your-railway-app.up.railway.app
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx
VITE_APP_ORIGIN=https://your-vercel-domain.vercel.app
```

---

## Testing & Validation

### 1. Backend Health Check

```bash
# Test backend is running
curl https://your-railway-app.up.railway.app/health

# Expected:
# {"ok":true,"service":"devpulse-hybrid-backend"}
```

### 2. CORS Validation

Test CORS headers with a preflight request:

```bash
curl -X OPTIONS https://your-railway-app.up.railway.app/api/generate \
  -H "Origin: https://your-vercel-domain.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

Look for these headers in response:
```
Access-Control-Allow-Origin: https://your-vercel-domain.vercel.app
Access-Control-Allow-Credentials: true
```

### 3. Frontend API Integration Test

1. Open application at `https://your-vercel-domain.vercel.app`
2. Open DevTools (F12) → Network tab
3. Perform an action that calls the backend (e.g., generate briefing)
4. Verify the request:
   - URL: `https://your-railway-app.up.railway.app/api/generate`
   - Status: 200 or 401 (not 403 CORS error)
   - Response: Valid JSON

### 4. JWT Token Validation

Test authentication endpoint:

```bash
curl -X POST https://your-railway-app.up.railway.app/api/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{"topic": "API Security"}'
```

Expected: 200 with briefing data (not 401)

### 5. Database Connection Check

In Railway logs, you should see:

```
[info] Hybrid backend running {
  "environment": "production",
  "port": 3001,
  "apiUrl": "https://your-railway-app.up.railway.app"
}
```

---

## Troubleshooting

### Issue: 502/503 Gateway Errors

**Cause:** Backend not starting properly

**Solution:**
```bash
# Check Railway logs
1. Go to Railway dashboard
2. Click "Logs" tab
3. Look for startup errors
4. Common: Missing environment variables or PORT binding

# Verify build command produces dist/server.js
npm run build:server
ls -la dist/server.js
```

### Issue: CORS Error (403 Forbidden)

**Cause:** `VITE_APP_ORIGIN` not set correctly

**Solution:**
```bash
# Backend sees request from: https://your-vercel-domain.vercel.app
# Must be in VITE_APP_ORIGIN list

# In Railway Variables:
VITE_APP_ORIGIN=https://your-vercel-domain.vercel.app,https://your-custom-domain.com
```

### Issue: 404 on API Endpoints

**Cause:** Routes not compiled or wrong URL

**Solution:**
```bash
# Verify build produced correct files
npm run build:server
cat dist/server.js | grep "app.listen"

# Verify env var matches actual backend URL
VITE_BACKEND_URL=https://your-railway-app.up.railway.app (no trailing slash)
```

### Issue: ReferenceError: fetch is not defined

**Cause:** Outdated Node version

**Solution:**
```
In Railway:
1. Go to Variables
2. Add NODE_VERSION=20 (or higher)
3. Redeploy
```

### Issue: JWT Token Failures

**Cause:** Different JWT secrets in dev vs production

**Solution:**
```bash
# Generate new secret
python3 -c "import secrets; print(secrets.token_hex(32))"

# In Railway Variables:
JWT_SECRET=<paste-new-secret>
# Redeploy and fetch new token from frontend
```

### Issue: Environment Variable Not Picked Up

**Cause:** Variable not in correct environment

**Solution:**
```
Vercel:
1. Settings → Environment Variables
2. Check boxes for all environments (Production, Preview, Development)
3. Redeploy with: vercel --prod

Railway:
1. Variables tab
2. Ensure variable is listed
3. Click "Redeploy"
```

---

## Post-Deployment Monitoring

### Set Up Error Tracking

1. **Sentry (Recommended)**
   - Create account at https://sentry.io
   - Create new project for Node.js
   - Get DSN and add to Railway:
     ```
     SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
     ```

2. **Railway Logs**
   - Monitor in dashboard: Settings → Logs
   - Look for ERROR level logs

### Set Up Uptime Monitoring

1. **Railway Built-in:** Settings → Monitoring
2. **UptimeRobot (Free)**
   - Create monitor for `https://your-railway-app.up.railway.app/health`
   - Set check interval to 5 minutes

### Monitor Performance

```bash
# Check response times
curl -w "Time: %{time_total}s\n" \
  https://your-railway-app.up.railway.app/health

# Should be < 500ms from cold start
```

### View Logs in Real-Time

**Railway Dashboard:**
- Click project → Logs tab
- Tail logs with: `railway logs --follow`

**Vercel Dashboard:**
- Click project → Analytics tab
- Monitor response times and errors

---

## 🎯 Deployment Checklist

- [ ] Backend built successfully: `npm run build:server`
- [ ] All env vars set in Railway
- [ ] Railway health endpoint responds: `/health`
- [ ] CORS origin set to Vercel domain
- [ ] Frontend env vars set in Vercel
- [ ] Frontend deployed on Vercel
- [ ] API calls work in browser (check Network tab)
- [ ] No 403/404 errors in browser console
- [ ] JWT authentication working
- [ ] Database queries working
- [ ] Monitoring/alerts configured
- [ ] SSL certificate valid (auto on both platforms)
- [ ] Rate limiting working
- [ ] Email/SMTP configured (if needed)

---

## Quick Deploy Script

```bash
# Local testing before deployment
npm run build:server
npm run build
npm start

# Commit and push
git add -A
git commit -m "Production ready release v1.0"
git push origin main

# Railway and Vercel will auto-deploy on push to main
# Monitor:
# - Railway: https://railway.app dashboard
# - Vercel: https://vercel.com dashboard
```

---

## Support & Debugging

1. Check Railway logs: `railway logs --follow`
2. Check Vercel logs: https://vercel.com → project → Deployments
3. Use curl to test backend endpoints manually
4. Enable debug mode:
   ```
   Railway: LOG_LEVEL=debug
   Vercel: VITE_DEBUG=true
   ```

---

**Last Updated:** 2026-03-26
**Status:** Production Ready ✅
