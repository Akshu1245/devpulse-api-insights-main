import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Mail, Lock, User, ArrowRight, Loader2, Github } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { getSafeNext } from "@/lib/auth";
import { useAuthContext } from "@/context/AuthContext";

type AuthMode = "login" | "signup" | "forgot";

function getOAuthErrorMessage(provider: "google" | "github", err: unknown): string {
  const rawMessage = err instanceof Error ? err.message : "An error occurred";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("unsupported provider") || normalized.includes("provider is not enabled")) {
    const providerName = provider === "google" ? "Google" : "GitHub";
    return `${providerName} sign-in is not enabled in Supabase Auth. Enable it in Supabase Dashboard → Authentication → Providers.`;
  }

  return rawMessage;
}

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { signIn, signUp, resetPassword } = useAuthContext();

  const next = getSafeNext(searchParams.get("next"), "/agentguard");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        await resetPassword(email);
        toast({ title: "Check your email", description: "We sent you a password reset link." });
        setMode("login");
        return;
      }

      if (mode === "login") {
        await signIn(email, password);
        navigate(next);
        return;
      }

      // signup
      await signUp(email, password, displayName);
      toast({ title: "Check your email", description: "We sent you a confirmation link." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: "google" | "github") => {
    setOauthLoading(true);
    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem(`oauth_${provider}_state`, state);

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${next}`,
          skipBrowserRedirect: false,
          queryParams: { state },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const message = getOAuthErrorMessage(provider, err);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold font-serif text-foreground">
            Dev<span className="text-primary">Pulse</span>
          </h1>
          <p className="text-muted-foreground mt-2">Sign in to unlock AgentGuard + your account</p>
        </div>

        {/* Form */}
        <div className="glass-card rounded-2xl p-8 border border-border">
          {mode !== "forgot" && (
            <div className="flex gap-2 mb-6">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    mode === m
                      ? "bg-primary/15 text-primary border border-primary/25"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "login" ? "Login" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          {mode === "forgot" && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-1">Reset Password</h2>
              <p className="text-sm text-muted-foreground">Enter your email to receive a reset link.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
              />
            </div>

            {mode !== "forgot" && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
            </button>
          </form>

          {mode !== "forgot" && (
            <>
              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* GitHub Sign In */}
              <button
                onClick={() => handleOAuthLogin("github")}
                disabled={oauthLoading}
                className="w-full py-3 rounded-xl border border-border bg-muted/20 text-foreground font-medium text-sm flex items-center justify-center gap-3 hover:bg-muted/40 transition-colors disabled:opacity-50"
              >
                {oauthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                Continue with GitHub
              </button>
            </>
          )}

          {/* Forgot password link */}
          <div className="mt-4 text-center">
            {mode === "login" && (
              <button
                onClick={() => setMode("forgot")}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Forgot your password?
              </button>
            )}

            {mode === "forgot" && (
              <button
                onClick={() => setMode("login")}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                ← Back to login
              </button>
            )}
          </div>
        </div>

        {/* Back to DEVPULSE */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← Back to DEVPULSE
          </button>
        </div>
      </motion.div>
    </div>
  );
}

