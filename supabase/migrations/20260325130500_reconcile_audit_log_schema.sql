-- Reconcile audit_log schema drift across earlier migrations.
-- Ensures compatibility for both direct inserts and RPC-based audit logging.

ALTER TABLE IF EXISTS public.audit_log
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resource_type text,
  ADD COLUMN IF NOT EXISTS resource_id uuid,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS error_message text;

-- Safe defaults so existing rows/functions continue working.
UPDATE public.audit_log
SET resource_type = COALESCE(resource_type, 'agentguard')
WHERE resource_type IS NULL;

UPDATE public.audit_log
SET status = COALESCE(status, 'success')
WHERE status IS NULL;

ALTER TABLE public.audit_log
  ALTER COLUMN details SET DEFAULT '{}'::jsonb;

ALTER TABLE public.audit_log
  ALTER COLUMN resource_type SET DEFAULT 'agentguard';

ALTER TABLE public.audit_log
  ALTER COLUMN status SET DEFAULT 'success';

-- Keep columns nullable where historical inserts may omit them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'Users can insert own audit logs'
  ) THEN
    CREATE POLICY "Users can insert own audit logs"
      ON public.audit_log
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_log_resource_type ON public.audit_log(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_status ON public.audit_log(status);

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_status text DEFAULT 'success',
  p_error_message text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    ip_address,
    user_agent,
    status,
    error_message
  ) VALUES (
    p_user_id,
    p_action,
    COALESCE(p_resource_type, 'agentguard'),
    p_resource_id,
    COALESCE(p_details, '{}'::jsonb),
    p_ip_address,
    p_user_agent,
    COALESCE(p_status, 'success'),
    p_error_message
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.log_audit_event(
  uuid,
  text,
  text,
  uuid,
  jsonb,
  text,
  text,
  text,
  text
) TO authenticated;
