# 🔧 DevPulse Production-Ready Quick Reference

## Local Development

```bash
# Install dependencies
npm install

# Development: Frontend + Backend together
npm run dev:hybrid

# Frontend only
npm run dev

# Backend only
npm run dev:server

# Test local backend
curl http://localhost:3001/health
```

## Building for Production

```bash
# Build backend server (TypeScript → JavaScript)
npm run build:server

# Build frontend (React/Vite)
npm run build

# Build both
npm run build:all

# Output locations:
# - Backend: ./dist/server.js (compiled from server/server.ts)
# - Frontend: ./dist/ (React app)
```

## Running in Production

```bash
# Start backend (compiled version)
npm start

# Verifies:
# - Environment variables loaded
# - Server listening on PORT env var or 3001
# - Health check available at /health
```

## Environment Variables Cheat Sheet

### Backend (NODE/EXPRESS)

| Variable | Example | Where to Set |
|----------|---------|--------------|
| `NODE_ENV` | `production` | Railway |
| `PORT` | `3001` | Railway (auto) |
| `JWT_SECRET` | `a1b2c3...` | Railway |
| `VITE_APP_ORIGIN` | `https://vercel.app` | Railway |
| `DATABASE_URL` | `postgresql://...` | Railway |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Railway |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Railway |
| `GEMINI_API_KEY` | `AIzaSy...` | Railway |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Railway |
| `API_URL` | `https://railway-app.up.railway.app` | Railway |

### Frontend (VITE/REACT)

| Variable | Example | Where to Set |
|----------|---------|--------------|
| `VITE_BACKEND_URL` | `https://railway-app.up.railway.app` | Vercel |
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Vercel |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Vercel |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Vercel |

## File Structure (Production Build)

```
Project Root
├── dist/                    ← Backend compiled output
│   ├── server.js           ← Main entry point (npm start)
│   ├── server.js.map       ← Source map for debugging
│   └── ...                 ← Compiled TypeScript files
│
├── .next/                  ← Frontend output (Vercel deployment)
│   └── (handled by Vercel during build)
│
├── server/
│   └── server.ts           ← TypeScript backend source
│
├── src/                    ← React frontend source
│   ├── lib/apiClient.ts   ← Uses VITE_BACKEND_URL
│   └── ...
│
├── package.json            ← Build scripts for both
├── tsconfig.server.json    ← Backend TypeScript config
├── vite.config.ts          ← Frontend Vite config
└── PRODUCTION_DEPLOYMENT.md ← Full deployment guide
```

## CORS Configuration

**Backend receives requests from:**
```
VITE_APP_ORIGIN env var (comma-separated list)
```

**Example:**
```
VITE_APP_ORIGIN=https://myapp.vercel.app,https://myapp.com,http://localhost:8080
```

**Verify in browser:**
- DevTools → Network tab
- Any API request should show:
  ```
  Access-Control-Allow-Origin: https://myapp.vercel.app
  Access-Control-Allow-Credentials: true
  ```

## Health Check Endpoint

```bash
# Always available at backend root
curl https://your-backend.up.railway.app/health

# Response:
{"ok":true,"service":"devpulse-hybrid-backend"}

# Used for monitoring, uptime checks, deployment validation
```

## Common Issues & Fixes

### API calls getting 403 CORS error
```
Fix: Check VITE_APP_ORIGIN includes your Vercel domain
Railway Variables → Update VITE_APP_ORIGIN → Redeploy
```

### 502 Bad Gateway from Railway
```
Fix: Check build produced dist/server.js
npm run build:server
ls dist/server.js  ← Should exist
```

### API calls showing 404
```
Fix: Verify VITE_BACKEND_URL in Vercel matches actual Railway URL
Vercel → Settings → Environment Variables → VITE_BACKEND_URL
Should be: https://your-app.up.railway.app (no trailing slash)
```

### JWT token errors
```
Fix: Regenerate JWT_SECRET and redeploy
python -c "import secrets; print(secrets.token_hex(32))"
Railway Variables → JWT_SECRET → Redeploy
```

## Deployment Flow

```
1. Local Development
   npm run dev:hybrid
   ↓
2. Build for Production
   npm run build:server && npm run build
   ↓
3. Git Push
   git push origin main
   ↓
4. Railway Auto-Deploy (Backend)
   - Pulls main branch
   - Runs: npm run build:server
   - Runs: npm start
   ↓
5. Vercel Auto-Deploy (Frontend)
   - Pulls main branch
   - Runs: npm run build
   - Deploys dist/ to CDN
   ↓
6. Manual Action: Update Railway VITE_APP_ORIGIN
   If Vercel URL changed, update in Railway
```

## Testing Before Production

```bash
# 1. Local build test
npm run build:server
NODE_ENV=production npm start

# 2. Test health endpoint
curl http://localhost:3001/health

# 3. Test with environment variables
PORT=3000 npm start
curl http://localhost:3000/health

# 4. Commit and push
git add -A
git commit -m "Production ready"
git push origin main

# 5. Monitor deployments
# Railway: https://railway.app
# Vercel: https://vercel.com
```

## Database Migrations

```bash
# If using Prisma for database schema
# Run before deployment (preferably in CI/CD):

npx prisma db push          # Apply schema to production DB
npx prisma generate         # Generate client types

# Add to Railway post-deployment script (if needed):
# Command: npx prisma db push
```

## Logs & Debugging

**Real-time backend logs:**
```bash
# Railway CLI
railway logs --follow

# Or via Railway Dashboard: Logs tab
```

**Check environment in production:**
```
Backend logs show:
"environment": "production"
"port": 3001
"apiUrl": "https://your-app.up.railway.app"
```

## Security Checklist

- [ ] `JWT_SECRET` is unique and strong (32+ chars)
- [ ] `SUPABASE_SERVICE_KEY` never in frontend code
- [ ] `STRIPE_SECRET_KEY` never in frontend code
- [ ] `DATABASE_URL` only in backend env vars
- [ ] CORS `VITE_APP_ORIGIN` matches actual deployed frontend domain
- [ ] `NODE_ENV=production` in Railway
- [ ] SSL/HTTPS automatically enabled on both platforms
- [ ] No console.log() calls logging secrets
- [ ] .env files in .gitignore (verified)

## Monitoring & Alerts

```bash
# Set up in Railway
1. Settings → Monitoring
2. Enable notifications
3. Set alert thresholds

# Set up in Vercel
1. Settings → Monitoring
2. Configure error tracking
3. Set performance budgets

# Manual monitoring
curl https://your-app.up.railway.app/health -w "\nResponse time: %{time_total}s\n"
# Should respond in < 500ms
```

## Useful Commands

```bash
# See what build:server outputs
npm run build:server && find dist -type f -name "*.js" | head -10

# Test specific endpoint
curl -X POST https://your-backend.up.railway.app/api/generate \
  -H "Authorization: Bearer YOUR_JWT"

# Check file sizes
du -sh dist/

# Verify TypeScript has no errors
npx tsc --noEmit --project tsconfig.server.json

# Generate new JWT secret
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 📚 Full Documentation

See `PRODUCTION_DEPLOYMENT.md` for complete deployment instructions, step-by-step guides for Railway & Vercel, and advanced troubleshooting.

---

**Quick Deploy:**  
```bash
git push origin main
# Railway auto-deploys backend
# Vercel auto-deploys frontend
# Monitor both dashboards
```
