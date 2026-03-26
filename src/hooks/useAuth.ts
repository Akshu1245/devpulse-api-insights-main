/**
 * useAuth — lightweight hook for components that only need auth state.
 *
 * For app-wide auth state (already subscribed once), prefer
 * `useAuthContext()` from `@/context/AuthContext`.
 *
 * This hook is kept for backwards compatibility with existing components
 * that import it directly.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /**
   * Returns the current JWT access token, or null if not authenticated.
   * Pass this as `Authorization: Bearer <token>` when calling the backend.
   */
  const getAccessToken = useCallback((): string | null => {
    return session?.access_token ?? null;
  }, [session]);

  return { user, session, loading, signOut, getAccessToken };
}
