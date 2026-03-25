-- Persist Health Dashboard API registry preferences per user.
-- Stores custom APIs and disabled API IDs for authenticated users.

CREATE TABLE IF NOT EXISTS public.user_api_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_apis jsonb NOT NULL DEFAULT '[]'::jsonb,
  disabled_api_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_api_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_api_preferences'
      AND policyname = 'Users can view own api preferences'
  ) THEN
    CREATE POLICY "Users can view own api preferences"
      ON public.user_api_preferences
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_api_preferences'
      AND policyname = 'Users can upsert own api preferences'
  ) THEN
    CREATE POLICY "Users can upsert own api preferences"
      ON public.user_api_preferences
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_api_preferences'
      AND policyname = 'Users can update own api preferences'
  ) THEN
    CREATE POLICY "Users can update own api preferences"
      ON public.user_api_preferences
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_user_api_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_api_preferences_updated_at ON public.user_api_preferences;
CREATE TRIGGER trg_user_api_preferences_updated_at
BEFORE UPDATE ON public.user_api_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_user_api_preferences_updated_at();
