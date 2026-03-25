import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";

type ProtectedRouteProps = {
  children: React.ReactNode;
};

// Cache auth state in memory to prevent loading flash on navigation
let cachedUser: any = null;
let cachedLoading = true;

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [showLoading, setShowLoading] = useState(true);

  // Update cache when auth state changes
  useEffect(() => {
    if (!loading) {
      cachedUser = user;
      cachedLoading = false;
    }
  }, [user, loading]);

  // Use cached value immediately to prevent loading flash
  useEffect(() => {
    // If we have a cached user, don't show loading
    if (cachedUser || !loading) {
      setShowLoading(false);
    } else {
      // Only show loading for a brief moment
      const timer = setTimeout(() => setShowLoading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // If still loading and no cache, show loader
  if (loading && showLoading && !cachedUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Use cached user if available
  const effectiveUser = user ?? cachedUser;

  if (!effectiveUser) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
