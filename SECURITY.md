# Security

## Environment & Secrets

- **Never commit** `.env` or files containing secrets. Use `.env.example` as a template.
- Supabase anon key is safe for client-side use. Service role key must **only** be used in Supabase Edge Functions (server-side).
- Stripe keys: use `STRIPE_SECRET_KEY` in Edge Functions only.

## Edge Functions

- All functions validate `Authorization: Bearer <jwt>` before processing.
- CORS is restricted to allowed origins (localhost ports + devpulse.in).
- `create-checkout` and `customer-portal` validate origin before redirect URLs to prevent open redirects.
- `api-proxy` whitelists allowed API hosts and validates protocol (http/https only).
- `send-webhook` blocks private IPs in webhook URLs (SSRF mitigation).

## Database

- Row Level Security (RLS) is enabled on all tables.
- Policies enforce `auth.uid() = user_id` for user-scoped access.
- Supabase client uses parameterized queries; no raw SQL with user input.

## Best Practices

- Run `npm audit` periodically.
- Rotate API keys if exposure is suspected.
- Use AgentGuard leak scanner to detect keys in logs.
