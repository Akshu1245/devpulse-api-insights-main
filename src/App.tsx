import { useState, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import SeoMeta from "@/components/SeoMeta";
import SplashScreen from "./components/SplashScreen";
import { DevPulseIDEProvider } from "@/context/DevPulseIDEContext";
import { Analytics } from "@vercel/analytics/react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import RefundPolicy from "./pages/RefundPolicy";
import Contact from "./pages/Contact";
import ApiMonitoringTool from "./pages/ApiMonitoringTool";
import AiAgentSecurityPlatform from "./pages/AiAgentSecurityPlatform";
import ApiMonitoringAlternatives from "./pages/ApiMonitoringAlternatives";

const AgentGuardGate = lazy(() => import("./pages/AgentGuardGate"));
const Auth = lazy(() => import("./pages/Auth"));
const AgentGuardSDKDocs = lazy(() => import("./pages/AgentGuardSDKDocs"));
const AgentGuardResetPassword = lazy(() => import("./pages/AgentGuardResetPassword"));
const AgentGuardAgentDetail = lazy(() => import("./pages/AgentGuardAgentDetail"));
const AgentGuardSettings = lazy(() => import("./pages/AgentGuardSettings"));
const DevPulseSecurityDashboard = lazy(() => import("./pages/DevPulseSecurityDashboard"));

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

const App = () => {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <DevPulseIDEProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
          <ErrorBoundary>
          <Toaster />
          <Sonner />
          <Analytics />
          {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
          <BrowserRouter>
            <SeoMeta />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/refund" element={<RefundPolicy />} />
                <Route path="/contact" element={<Contact />} />
              <Route path="/api-monitoring-tool" element={<ApiMonitoringTool />} />
              <Route path="/ai-agent-security-platform" element={<AiAgentSecurityPlatform />} />
              <Route path="/api-monitoring-alternatives" element={<ApiMonitoringAlternatives />} />
                <Route path="/agentguard" element={<AgentGuardGate />} />
                <Route path="/agentguard/landing" element={<AgentGuardGate />} />
                <Route path="/devpulse/security" element={<DevPulseSecurityDashboard />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/reset-password" element={<AgentGuardResetPassword />} />
                {/* Backward-compatible route (single auth UI lives at /auth) */}
                <Route path="/agentguard/auth" element={<Auth />} />
                <Route path="/agentguard/docs" element={<AgentGuardSDKDocs />} />
                <Route path="/agentguard/reset-password" element={<AgentGuardResetPassword />} />
                <Route path="/agentguard/agent/:agentId" element={<AgentGuardAgentDetail />} />
                <Route path="/agentguard/settings" element={<AgentGuardSettings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          </ErrorBoundary>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </DevPulseIDEProvider>
  );
};

export default App;
