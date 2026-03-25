# DevPulse API Insights

⚡ **LIGHTNING-FAST** Vite + React dashboard for API health monitoring and AgentGuard (AI agent cost control, leak detection, kill switch).

## ⚡ PERFORMANCE-FIRST MANIFESTO

**THIS APP IS BUILT FOR SPEED.** All new features MUST maintain or improve performance.

### Non-Negotiable Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| **Initial Bundle** | < 100KB gzipped | ✅ 82KB |
| **LCP** | < 1.5s | ✅ Achieved |
| **FID** | < 100ms | ✅ Achieved |
| **CLS** | < 0.1 | ✅ Achieved |

### Key Optimizations Already Implemented

- ✅ **Code splitting** - All routes lazy-loaded
- ✅ **React Query caching** - API responses cached 30s-5min
- ✅ **Service worker** - Offline support + instant cache
- ✅ **Bundle optimization** - Manual chunks for vendor/ui/charts
- ✅ **Auth caching** - No loading flash on navigation
- ✅ **Performance monitoring** - Core Web Vitals tracked
- ✅ **Console stripping** - Production builds remove logs

**📖 READ [PERFORMANCE.md](PERFORMANCE.md) BEFORE ADDING ANY FEATURES**

---

## Setup

1. **Install dependencies**
   ```sh
   npm i
   ```

2. **Configure environment**
   Copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL` – your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` – your Supabase anon/public key
   - `APP_ALLOWED_ORIGINS` – comma-separated web origins allowed to call Supabase edge functions (include your production domain)

3. **Run development server**
   ```sh
   npm run dev
   ```
   App runs at http://localhost:8080

4. **Supabase migrations**  
   Run `supabase db push` (or apply migrations) to create tables. The `user_api_keys` table is required for the api-proxy edge function.

5. **Supabase secrets (production)**
   Set required secrets before going live:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY` (if using paid plans)
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (recommended)
   - `KEY_ENCRYPTION_SECRET` (required for encrypted `user_api_keys` vault)

## Project info



## How can I edit this code?

There are several ways of editing your application.



**Use your preferred IDE**



The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?





Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

## VS Code extension

A companion VS Code extension is available in `vscode-extension/`.

```sh
cd vscode-extension
npm install
npm run build
```

Then press `F5` in VS Code from that folder to run the extension in an Extension Development Host.


