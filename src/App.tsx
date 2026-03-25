import { useEffect, useState, lazy, Suspense, startTransition } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import SeoMeta from "@/components/SeoMeta";
import PerformanceMonitor from "@/components/PerformanceMonitor";
import SplashScreen from "./components/SplashScreen";
import { DevPulseIDEProvider } from "@/context/DevPulseIDEContext";
import { usePerformanceOptimizations } from "@/hooks/usePerformanceOptimizations";

// Lazy load ALL pages for optimal code splitting
const Index = lazy(() => import("./pages/Index"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const Contact = lazy(() => import("./pages/Contact"));
const ApiMonitoringTool = lazy(() => import("./pages/ApiMonitoringTool"));
const AiAgentSecurityPlatform = lazy(() => import("./pages/AiAgentSecurityPlatform"));
const ApiMonitoringAlternatives = lazy(() => import("./pages/ApiMonitoringAlternatives"));
const AgentGuardGate = lazy(() => import("./pages/AgentGuardGate"));
const Auth = lazy(() => import("./pages/Auth"));
const AgentGuardSDKDocs = lazy(() => import("./pages/AgentGuardSDKDocs"));
const AgentGuardResetPassword = lazy(() => import("./pages/AgentGuardResetPassword"));
const AgentGuardAgentDetail = lazy(() => import("./pages/AgentGuardAgentDetail"));
const AgentGuardSettings = lazy(() => import("./pages/AgentGuardSettings"));
const DevPulseSecurityDashboard = lazy(() => import("./pages/DevPulseSecurityDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Eagerly preload the most critical routes in background after initial render
function preloadCriticalRoutes() {
  startTransition(() => {
    import("./pages/Index");
    import("./pages/AgentGuardGate");
    import("./pages/Auth");
  });
}

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

// Inner component lives inside BrowserRouter so useLocation works correctly
const AppRoutes = ({
  splashDone,
  setSplashDone,
}: {
  splashDone: boolean;
  setSplashDone: (v: boolean) => void;
}) => {
  // usePerformanceOptimizations calls useRoutePreload → useLocation, must be inside BrowserRouter
  usePerformanceOptimizations();
  return (
    <>
      <SeoMeta />
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
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
    </>
  );
};

const App = () => {
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    // Fail-safe: force-close splash after 1s max (splash auto-completes in ~800ms)
    const timeoutId = setTimeout(() => setSplashDone(true), 1000);
    // Preload critical routes in background immediately
    preloadCriticalRoutes();
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <DevPulseIDEProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ErrorBoundary>
              <PerformanceMonitor />
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppRoutes splashDone={splashDone} setSplashDone={setSplashDone} />
              </BrowserRouter>
            </ErrorBoundary>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </DevPulseIDEProvider>
  );
};

export default App;
