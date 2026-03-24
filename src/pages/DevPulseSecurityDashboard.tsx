import { useState } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import OverviewCards from "@/components/devpulse/OverviewCards";
import APIScanner from "@/components/devpulse/APIScanner";
import LLMCostPanel from "@/components/devpulse/LLMCostPanel";
import AlertsPanel from "@/components/devpulse/AlertsPanel";
import CompliancePanel from "@/components/devpulse/CompliancePanel";

function DashboardContent() {
  const { user, signOut } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="text-muted-foreground hover:text-foreground shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Shield className="w-6 h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold font-serif text-foreground truncate">
                DevPulse <span className="text-primary">Security</span>
              </h1>
              <p className="text-xs text-muted-foreground truncate font-mono">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="text-xs sm:text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border"
            >
              Refresh overview
            </button>
            <button type="button" onClick={() => void signOut()} className="text-xs sm:text-sm text-muted-foreground hover:text-foreground">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <OverviewCards userId={user.id} refreshKey={refreshKey} />
        <APIScanner userId={user.id} />
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <LLMCostPanel userId={user.id} />
          <AlertsPanel userId={user.id} />
        </div>
        <CompliancePanel userId={user.id} />
      </main>
    </div>
  );
}

export default function DevPulseSecurityDashboard() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
