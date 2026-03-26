/**
 * AuthContext — global Supabase auth state provider.
 *
 * Wraps the app so any component can call `useAuthContext()` to get the
 * current user, session, loading state, and a signOut helper without
 * re-subscribing to Supabase on every render.
 *
 * Usage:
 *   import { useAuthContext } from "@/context/AuthContext";
 *   const { user, session, loading, signOut } = useAuthContext();
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  session: Session | null;
  /** True only during the initial session hydration (< 300 ms typically). */
  loading: boolean;
  /** Sign the current user out and clear local session. */
  signOut: () => Promise<void>;
  /**
   * Returns the JWT access token for the current session, or null if the
   * user is not authenticated.  Use this to attach `Authorization: Bearer`
   * headers when calling the DevPulse backend.
   */
  getAccessToken: () => string | null;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hydrate from persisted session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Keep state in sync with Supabase auth events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Once we receive any auth event, loading is definitely done
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const getAccessToken = useCallback((): string | null => {
    return session?.access_token ?? null;
  }, [session]);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signOut, getAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used inside <AuthProvider>");
  }
  return ctx;
}
