import { useState } from "react";
import { ArrowLeft, Shield, Brain, Upload, FileText, ScanSearch, DollarSign, Bell, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import OverviewCards from "@/components/devpulse/OverviewCards";
import APIScanner from "@/components/devpulse/APIScanner";
import LLMCostPanel from "@/components/devpulse/LLMCostPanel";
import AlertsPanel from "@/components/devpulse/AlertsPanel";
import CompliancePanel from "@/components/devpulse/CompliancePanel";
import PostmanImporter from "@/components/devpulse/PostmanImporter";
import ThinkingTokenPanel from "@/components/devpulse/ThinkingTokenPanel";
import ComplianceReportPanel from "@/components/devpulse/ComplianceReportPanel";
import ShadowApiPanel from "@/components/devpulse/ShadowApiPanel";

type Tab = "overview" | "postman" | "scanner" | "llm" | "thinking" | "shadow" | "compliance" | "alerts";

const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "postman", label: "Postman Import", icon: Upload, badge: "NEW" },
  { id: "scanner", label: "API Scanner", icon: ScanSearch },
  { id: "llm", label: "LLM Costs", icon: DollarSign },
  { id: "thinking", label: "Thinking Tokens", icon: Brain, badge: "Patent 2" },
  { id: "shadow", label: "Shadow APIs", icon: Eye, badge: "Patent 3" },
  { id: "compliance", label: "Compliance", icon: FileText, badge: "PCI DSS" },
  { id: "alerts", label: "Alerts", icon: Bell },
];

function DashboardContent() {
  const { user, signOut } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
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
              Refresh
            </button>
            <button type="button" onClick={() => void signOut()} className="text-xs sm:text-sm text-muted-foreground hover:text-foreground">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Tab Bar */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-none py-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0
                    ${activeTab === tab.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.badge && (
                    <span className="text-[10px] bg-primary/20 text-primary px-1 py-0.5 rounded">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === "overview" && (
          <div className="space-y-8">
            <OverviewCards userId={user.id} refreshKey={refreshKey} />
            <div className="grid lg:grid-cols-2 gap-8 items-start">
              <LLMCostPanel userId={user.id} />
              <AlertsPanel userId={user.id} />
            </div>
          </div>
        )}

        {activeTab === "postman" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold font-serif text-foreground">Postman Collection Import</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Import your Postman collection to instantly detect exposed credentials and security vulnerabilities.
                This is the fastest way to find API keys that may have been leaked in public workspaces.
              </p>
            </div>
            <PostmanImporter userId={user.id} />
          </div>
        )}

        {activeTab === "scanner" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold font-serif text-foreground">API Security Scanner</h2>
              <p className="text-sm text-muted-foreground mt-1">
                OWASP API Security Top 10 scanning. Checks HTTPS enforcement, security headers, CORS policy,
                and credential exposure. Results stored per user for compliance evidence.
              </p>
            </div>
            <APIScanner userId={user.id} />
          </div>
        )}

        {activeTab === "llm" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold font-serif text-foreground">LLM Cost Intelligence</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time token usage and cost tracking across OpenAI, Anthropic, Google, Mistral, and Cohere.
                Per-model breakdown with 30-day trend analysis.
              </p>
            </div>
            <LLMCostPanel userId={user.id} />
          </div>
        )}

        {activeTab === "thinking" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold font-serif text-foreground">Thinking Token Attribution</h2>
              <p className="text-sm text-muted-foreground mt-1">
                First-in-world detection of hidden reasoning tokens in OpenAI o1/o3 and Anthropic Claude extended thinking.
                Uses differential token analysis and response timing signatures (Patent NHCE/DEV/2026/002).
              </p>
            </div>
            <ThinkingTokenPanel userId={user.id} />
          </div>
        )}

        {activeTab === "shadow" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold font-serif text-foreground">Shadow API Discovery</h2>
              <p className="text-sm text-muted-foreground mt-1">
                IDE-level static route extraction correlated with local development traffic to discover
                undocumented shadow API endpoints. Zero network infrastructure required (Patent NHCE/DEV/2026/003).
              </p>
            </div>
            <ShadowApiPanel userId={user.id} />
          </div>
        )}

        {activeTab === "compliance" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold font-serif text-foreground">Compliance Evidence Generator</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Automated PCI DSS v4.0.1 and GDPR compliance evidence from your security scan results.
                At $99/month vs $15,000+ for QSA engagement (Patent NHCE/DEV/2026/004).
              </p>
            </div>
            <ComplianceReportPanel userId={user.id} />
            <CompliancePanel userId={user.id} />
          </div>
        )}

        {activeTab === "alerts" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold font-serif text-foreground">Security Alerts</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time alerts for security vulnerabilities, cost anomalies, and AgentGuard kill switch events.
              </p>
            </div>
            <AlertsPanel userId={user.id} />
          </div>
        )}
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

          </div>
        )}
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

