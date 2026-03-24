-- User API keys table for api-proxy (stores encrypted keys for proxied API calls)
CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  encrypted_key text NOT NULL,
  key_alias text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api keys" ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own api keys" ON public.user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own api keys" ON public.user_api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own api keys" ON public.user_api_keys
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_api_keys_user_id ON public.user_api_keys(user_id);
