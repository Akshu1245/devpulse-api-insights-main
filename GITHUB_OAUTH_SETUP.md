# GitHub OAuth Setup Guide

This document explains how to enable GitHub OAuth authentication in DevPulse.

## Issue
GitHub sign-in appears to be configured on the frontend but is not working because:
1. GitHub OAuth provider is NOT ENABLED in Supabase Dashboard
2. Redirect URLs are not registered

## Solution

### Step 1: Create GitHub OAuth App
> If you already have a GitHub OAuth app, skip to Step 2

1. Go to GitHub Settings → Developer Settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: `DevPulse API Insights`
   - **Homepage URL**: `https://devpulse-api-insights-main-main-seven.vercel.app`
   - **Authorization callback URL**: `https://devpulse-api-insights-main-main-seven.vercel.app/auth/callback`
4. Save your `Client ID` and `Client Secret`

### Step 2: Enable GitHub OAuth in Supabase Dashboard
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your DevPulse project
3. Navigate to: **Authentication** → **Providers**
4. Find **GitHub** and click to expand
5. Enable GitHub:
   - Toggle **Enable** to ON
   - Paste `Client ID` from your GitHub OAuth app
   - Paste `Client Secret` from your GitHub OAuth app
   - Click **Save**

### Step 3: Register Redirect URLs
In the same GitHub provider settings in Supabase, ensure these redirect URLs are registered:

```
https://devpulse-api-insights-main-main-seven.vercel.app/auth
https://devpulse-api-insights-main-main-seven.vercel.app/auth/callback
https://devpulse-api-insights-main-main-seven.vercel.app/auth/github
```

### Step 4: Test GitHub OAuth
1. Go to deployed app: https://devpulse-api-insights-main-main-seven.vercel.app
2. Click "Sign in with GitHub" button
3. You should be redirected to GitHub for authorization
4. After authorizing, you'll be logged in to DevPulse

## Local Development Testing

For local development, also add these URLs to your OAuth app:

```
http://localhost:5173/auth
http://localhost:5173/auth/callback
http://localhost:5173/auth/github
```

Then add to Supabase GitHub provider redirect list.

## Troubleshooting

### "Invalid redirect_uri" Error
- Verify the exact URL matches in both GitHub app settings AND Supabase provider settings
- Check for trailing slashes and protocol (http vs https)

### "OAuth app not found" Error
- Confirm GitHub OAuth provider is ENABLED in Supabase Dashboard
- Verify Client ID and Secret are correctly pasted (no extra spaces)

### Still seeing "GitHub sign in not working"
1. Check browser DevTools Console for errors
2. Verify Supabase project is correctly configured
3. Confirm your frontend is using the correct Supabase environment variables

## Frontend OAuth Flow (Already Implemented)

The frontend is already configured with:
- **PKCE flow** for secure authentication
- **State parameter** protection against CSRF
- **Error handling** and user feedback
- **JWT token storage** in localStorage

Files involved:
- `src/lib/auth.ts` - Supabase client with OAuth config
- `src/pages/Auth.tsx` - GitHub sign-in button
- `src/context/AuthContext.tsx` - Global auth state management

## Backend OAuth Support

The backend automatically handles:
- JWT token verification via `get_current_user_id` dependency
- User session management
- Protected endpoint authentication

No additional backend configuration needed once Supabase provider is enabled.

## Production Deployment

Current production URLs:
- **Main**: https://devpulse-api-insights-main-main-seven.vercel.app
- **Aliases**: https://devpulse-api-insights-main-main-nmu60dejg.vercel.app
- **Backend**: https://api.devpulse.example.com (if separate deployment)

All these URLs should be registered as authorized redirect URIs in GitHub OAuth app if needed.

---

**Time to Enable**: ~15 minutes
**Required Role**: Supabase project owner/admin + GitHub account access
