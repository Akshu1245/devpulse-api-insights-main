# DevPulse — Auth (JWT) Implementation

> **Step 3 of the DevPulse build plan.**  
> Covers login/signup UI, JWT-protected backend endpoints, and user isolation.

---

## Architecture Overview

```
Browser (React SPA)
  │
  ├─ /auth          → Auth.tsx  (login / signup / forgot-password / GitHub OAuth)
  │
  ├─ /agentguard/*  → ProtectedRoute → redirects to /auth if no session
  │
  └─ apiClient.ts   → attaches  Authorization: Bearer <JWT>  to every backend call
                                                │
                                                ▼
                                    FastAPI backend
                                    ┌─────────────────────────────┐
                                    │  JWTAuthMiddleware           │
                                    │  (validates token globally)  │
                                    │                              │
                                    │  get_current_user_id()       │
                                    │  (per-endpoint dependency)   │
                                    │                              │
                                    │  assert_same_user()          │
                                    │  (user isolation guard)      │
                                    └─────────────────────────────┘
                                                │
                                                ▼
                                    Supabase (auth + database)
                                    Row-Level Security enforces
                                    user_id = auth.uid() at DB level
```

---

## Frontend

### Auth Page — `src/pages/Auth.tsx`

Single page with three modes:

| Mode | Description |
|------|-------------|
| `login` | Email + password sign-in via `supabase.auth.signInWithPassword` |
| `signup` | Email + password registration; sends confirmation email |
| `forgot` | Password reset email via `supabase.auth.resetPasswordForEmail` |

GitHub OAuth is also available via `supabase.auth.signInWithOAuth`.

After successful login the user is redirected to the `?next=` query param (default `/agentguard`).

### Auth Context — `src/context/AuthContext.tsx`

Provides global auth state to the entire app:

```tsx
import { useAuthContext } from "@/context/AuthContext";

const { user, session, loading, signOut, getAccessToken } = useAuthContext();
```

`AuthProvider` is mounted in `src/App.tsx` wrapping all routes.

### Protected Routes — `src/components/ProtectedRoute.tsx`

Wraps any route that requires authentication:

```tsx
<Route
  path="/agentguard"
  element={
    <ProtectedRoute>
      <AgentGuardGate />
    </ProtectedRoute>
  }
/>
```

Unauthenticated users are redirected to `/auth?next=<current-path>`.

**Protected routes:**
- `/agentguard` and `/agentguard/landing`
- `/agentguard/docs`
- `/agentguard/agent/:agentId`
- `/agentguard/settings`
- `/devpulse/security`

### API Client — `src/lib/apiClient.ts`

Thin fetch wrapper that automatically attaches the JWT:

```ts
import { apiClient } from "@/lib/apiClient";

// GET with auth header
const scans = await apiClient.get<ScanList>(`/scans/${userId}`);

// POST with auth header
const result = await apiClient.post<ScanResult>("/scan", {
  endpoint: "https://api.example.com/users",
  user_id: userId,
});
```

The backend URL is read from `VITE_BACKEND_URL` (defaults to `http://localhost:8000`).

### useAuth Hook — `src/hooks/useAuth.ts`

Backwards-compatible hook for components that subscribe to auth state directly:

```ts
const { user, session, loading, signOut, getAccessToken } = useAuth();
const token = getAccessToken(); // → "eyJ..." or null
```

---

## Backend

### Global JWT Middleware — `backend/main.py` → `JWTAuthMiddleware`

Every request to a non-public path is validated at the middleware layer:

1. Checks for `Authorization: Bearer <token>` header
2. Calls `supabase.auth.get_user(token)` to validate the JWT
3. Stores `request.state.user_id` for downstream handlers
4. Returns `401` immediately if the token is missing or invalid

**Public paths** (bypass auth):
- `GET /health`
- `GET /ready`
- `GET /docs`, `GET /openapi.json`, `GET /redoc`
- `OPTIONS *` (CORS pre-flight)

### Per-Endpoint Auth Dependency — `backend/services/auth_guard.py`

Two FastAPI dependencies enforce auth at the endpoint level:

#### `get_current_user_id`

```python
from services.auth_guard import get_current_user_id

@router.get("/scans/{user_id}")
def list_scans(user_id: str, auth_user_id: str = Depends(get_current_user_id)):
    assert_same_user(auth_user_id, user_id)
    ...
```

Returns the authenticated user's UUID string.  Raises `HTTP 401` if invalid.

#### `require_auth`

```python
from services.auth_guard import require_auth

@router.post("/shadow-api/discover")
async def discover(body: DiscoverRequest, _auth: dict = Depends(require_auth)):
    # _auth = {"user_id": "...", "email": "..."}
    ...
```

Returns a dict with `user_id` and `email`.  Used by the shadow-api router.

### User Isolation — `assert_same_user`

```python
from services.auth_guard import assert_same_user

assert_same_user(auth_user_id, req.user_id)  # raises HTTP 403 if mismatch
```

Called on every endpoint that accepts a `user_id` parameter to ensure users
can only access their own data.

### Supabase Client — `backend/services/supabase_client.py`

Lazy-initialised singleton using `@lru_cache`:

```python
from services.supabase_client import get_supabase

client = get_supabase()  # created once, reused on subsequent calls
```

The module-level `supabase` alias is kept for backwards compatibility.

---

## Database — Row-Level Security (RLS)

All user-data tables in Supabase have RLS policies that enforce:

```sql
-- Example: api_scans table
CREATE POLICY "Users can only see their own scans"
  ON api_scans FOR ALL
  USING (auth.uid() = user_id);
```

This provides a second layer of isolation even if the application layer is
bypassed.

---

## Environment Variables

### Frontend (`.env.local`)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_BACKEND_URL=http://localhost:8000
```

### Backend (`.env`)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   # service-role key (never expose to browser)
```

---

## Auth Flow Sequence

```
User visits /agentguard
    │
    ▼
ProtectedRoute checks useAuth()
    │
    ├─ loading=true  → show spinner
    │
    ├─ user=null     → redirect to /auth?next=/agentguard
    │                       │
    │                       ▼
    │                   Auth.tsx (login form)
    │                       │
    │                       ▼
    │                   supabase.auth.signInWithPassword()
    │                       │
    │                       ▼
    │                   JWT stored in localStorage
    │                       │
    │                       ▼
    │                   navigate(/agentguard)
    │
    └─ user≠null     → render <AgentGuardGate />
                            │
                            ▼
                        apiClient.post("/scan", {...})
                            │
                            ▼
                        Authorization: Bearer <JWT>
                            │
                            ▼
                        FastAPI JWTAuthMiddleware validates
                            │
                            ▼
                        get_current_user_id() dependency
                            │
                            ▼
                        assert_same_user(auth_id, req.user_id)
                            │
                            ▼
                        Supabase RLS: auth.uid() = user_id
```

---

## Testing

```bash
cd backend
pytest tests/test_auth_isolation.py -v
```

Tests cover:
- Missing / malformed Authorization header → 401
- Invalid / expired token → 401
- Valid token, wrong user_id → 403
- Valid token, correct user_id → passes through
- `assert_same_user` unit tests
- `require_auth` unit tests
